import type { CatalogItem } from '../../types.ts';
import type {
  ProjectStructuredAssumption,
  SourceQuoteLineRecord,
  SourceQuoteRecord,
  SourceQuoteRowType,
  TakeoffLineRecord,
} from '../../shared/types/estimator.ts';
import { buildProjectAssumptionsForInstall } from '../../shared/utils/projectBlockingAssumptions.ts';
import { classifyQuoteRow } from '../../shared/utils/quoteStagingParser.ts';
import { prepareCatalogMatch } from './intakeCatalogMatching.ts';
import { evaluateInstallability } from './intake/installabilityRules.ts';
import {
  getActiveInstallIntelligenceWorkbook,
  inferCategoryKey,
  resolveInstallIntelligenceFromWorkbook,
} from './div10InstallIntelligenceService.ts';

export interface QuoteImportResolvedLine {
  createInput: Partial<TakeoffLineRecord> & {
    projectId: string;
    roomId: string;
    description: string;
  };
  flags: string[];
}

function normalizeCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function findExactCatalogMatch(line: SourceQuoteLineRecord, catalog: CatalogItem[]): CatalogItem | null {
  const sku = normalizeCode(line.skuModel);
  if (!sku) return null;

  for (const item of catalog) {
    const candidates = [
      item.sku,
      item.model,
      item.modelNumber,
      item.canonicalSku,
    ].map(normalizeCode).filter(Boolean);
    if (candidates.some((c) => c === sku)) return item;
  }
  return null;
}

function findAliasOrModelCatalogMatch(line: SourceQuoteLineRecord, catalog: CatalogItem[]): CatalogItem | null {
  const sku = normalizeCode(line.skuModel);
  const desc = String(line.normalizedDescription || line.rawDescription || '').toLowerCase();
  if (!sku && !desc) return null;

  let best: { item: CatalogItem; score: number } | null = null;
  for (const item of catalog) {
    let score = 0;
    const skuCandidates = [item.sku, item.model, item.modelNumber, item.canonicalSku]
      .map(normalizeCode)
      .filter(Boolean);
    if (sku && skuCandidates.some((candidate) => candidate.includes(sku) || sku.includes(candidate))) {
      score += 4;
    }
    const itemText = `${item.description || ''} ${item.category || ''} ${item.subcategory || ''}`.toLowerCase();
    if (desc && desc.length > 8 && (itemText.includes(desc) || desc.includes(itemText.slice(0, Math.min(itemText.length, 24))))) {
      score += 2;
    }
    if (desc && item.description && desc.includes(String(item.description).toLowerCase())) score += 1;
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best?.item || null;
}

export function resolveQuoteLineForEstimate(input: {
  quote: SourceQuoteRecord;
  line: SourceQuoteLineRecord;
  projectId: string;
  roomId: string;
  catalogItems: CatalogItem[];
  projectSetup?: {
    defaultProposalVisibility?: TakeoffLineRecord['proposalVisibility'];
    suppressAutoLaborForInstallServiceRows?: boolean;
    wallSubstrate?: string | null;
    structuredAssumptions?: ProjectStructuredAssumption[] | null;
  };
}): QuoteImportResolvedLine {
  const normalizedDescription = String(input.line.normalizedDescription || input.line.rawDescription || '').trim();
  const rowType = (input.line.rowType || classifyQuoteRow({
    description: normalizedDescription,
    unit: input.line.unit,
    unitCost: input.line.unitCost,
    totalCost: input.line.totalCost,
  })) as SourceQuoteRowType;

  const flags: string[] = [];

  const exactMatch = findExactCatalogMatch(input.line, input.catalogItems);
  const aliasOrModelMatch = exactMatch ? null : findAliasOrModelCatalogMatch(input.line, input.catalogItems);
  const prepared = prepareCatalogMatch(
    {
      itemCode: input.line.skuModel || undefined,
      itemName: normalizedDescription,
      description: normalizedDescription,
      notes: input.line.manufacturer || undefined,
      unit: input.line.unit || undefined,
    },
    input.catalogItems
  );

  const preparedMatch = prepared.catalogMatch
    ? input.catalogItems.find((item) => item.id === prepared.catalogMatch?.catalogItemId) || null
    : null;
  const matchedCatalogItem = exactMatch ?? aliasOrModelMatch ?? preparedMatch;

  const category = matchedCatalogItem?.category || null;
  const subcategory = matchedCatalogItem?.subcategory || null;
  const installability = evaluateInstallability({
    itemName: normalizedDescription,
    description: normalizedDescription,
    category,
    sourceManufacturer: input.line.manufacturer,
    unit: input.line.unit,
  });

  const workbook = getActiveInstallIntelligenceWorkbook();
  const categoryKey = inferCategoryKey({
    description: normalizedDescription,
    category,
    workbook,
  });

  const intelligence = resolveInstallIntelligenceFromWorkbook(workbook, {
    lineFacts: {
      description: normalizedDescription,
      category,
      categoryKey,
      laborFamily: matchedCatalogItem?.installLaborFamily || null,
      unit: input.line.unit || 'EA',
      qty: input.line.qty,
      vendorName: input.quote.vendorName,
      sku: input.line.skuModel || matchedCatalogItem?.sku || null,
      rowType,
      sourceType: 'vendor_quote',
      catalogLaborMinutes: Number(matchedCatalogItem?.baseLaborMinutes || 0),
      assumptions: {},
    },
    projectAssumptions: buildProjectAssumptionsForInstall({
      wallSubstrate: input.projectSetup?.wallSubstrate,
      structuredAssumptions: input.projectSetup?.structuredAssumptions,
    }),
    suppressBrightenLaborForVendorService: input.projectSetup?.suppressAutoLaborForInstallServiceRows ?? true,
  });

  const installFamilyKey = intelligence.laborFamily || matchedCatalogItem?.installLaborFamily || null;
  let laborMinutes = intelligence.laborMinutes;
  let generatedLaborMinutes = intelligence.generatedLaborMinutes;
  let laborOrigin = intelligence.laborOrigin;

  if (rowType === 'freight') {
    flags.push('Freight row — cost add-in only; internal install labor suppressed.');
  } else if (rowType === 'installation' || rowType === 'service') {
    flags.push('Vendor installation/service row — Brighten labor fallback suppressed.');
  } else if (laborOrigin === 'catalog') {
    flags.push('Labor baseline from catalog match.');
  } else if (laborOrigin === 'install_family') {
    flags.push(`Install labor generated from labor family ${installFamilyKey}.`);
  } else if (!laborMinutes) {
    flags.push('Manual labor assignment required (no catalog or labor-family baseline).');
  }

  if (intelligence.vendorCanonical && intelligence.vendorCanonical !== input.quote.vendorName) {
    flags.push(`Vendor normalized: ${intelligence.vendorCanonical}`);
  }
  if (intelligence.vendorParserProfileKey) {
    flags.push(`Vendor parser profile: ${intelligence.vendorParserProfileKey}`);
  }
  if (intelligence.needsReview) {
    flags.push('Needs Review — install intelligence high-risk fields incomplete.');
  }
  if (intelligence.blockAutoPriceLabor) {
    flags.push('Auto-price labor blocked pending install assumptions.');
  }
  for (const flag of intelligence.reviewFlags) {
    flags.push(`Install review: ${flag}`);
  }
  for (const q of intelligence.requiredQuestions) {
    if (q.required) flags.push(`Install question required: ${q.prompt}`);
  }
  for (const clause of intelligence.proposalClauses) {
    if (!clause.internalOnly && clause.clientText) {
      flags.push(`Proposal clause: ${clause.clauseKey}`);
    }
  }

  if (exactMatch) {
    flags.push('Catalog match: exact SKU/model.');
  } else if (aliasOrModelMatch) {
    flags.push('Catalog match: alias/SKU/model fallback.');
  } else if (preparedMatch) {
    flags.push('Catalog match: fuzzy description fallback.');
  }
  if (!matchedCatalogItem && installFamilyKey) {
    flags.push(`Labor family from install intelligence (${installFamilyKey}).`);
  }

  const unitMaterial =
    Number(input.line.materialCost || 0)
    || Number(input.line.unitCost || 0)
    || (Number(input.line.totalCost || 0) > 0 && Number(input.line.qty || 0) > 0
      ? Number(input.line.totalCost || 0) / Number(input.line.qty || 1)
      : 0);

  const mergedNotes = [
    input.line.notes,
    `Source row type: ${rowType}`,
    ...intelligence.internalNotes,
    intelligence.requiredQuestions.length
      ? `Install questions: ${intelligence.requiredQuestions.map((q) => q.prompt).join('; ')}`
      : null,
    ...intelligence.proposalClauses
      .filter((c) => !c.internalOnly && c.clientText)
      .map((c) => `Proposal clause: ${c.clientText}`),
    intelligence.needsReview ? 'Needs Review' : null,
  ]
    .filter(Boolean)
    .join(' | ')
    .trim();

  return {
    createInput: {
      projectId: input.projectId,
      roomId: input.roomId,
      sourceType: 'vendor_quote',
      sourceRef: input.line.id,
      sourceLineType: rowType === 'freight' || rowType === 'service' || rowType === 'installation' ? 'add_in' : 'source_line',
      description: normalizedDescription,
      sku: input.line.skuModel || matchedCatalogItem?.sku || null,
      category,
      subcategory,
      qty: input.line.qty,
      unit: input.line.unit,
      materialCost: Number(unitMaterial.toFixed(2)),
      sourceMaterialCost: input.line.unitCost ?? null,
      laborMinutes,
      generatedLaborMinutes,
      laborOrigin,
      notes: mergedNotes || `Imported from ${input.quote.vendorName}`,
      catalogItemId: matchedCatalogItem?.id || null,
      intakeMatchConfidence: prepared.catalogMatch?.confidence || null,
      sourceManufacturer: input.line.manufacturer || null,
      isInstallableScope: installability.isInstallableScope,
      installScopeType: installability.installScopeType,
      installLaborFamily: installFamilyKey,
      proposalVisibility:
        rowType === 'note'
          ? 'internal_only'
          : (input.projectSetup?.defaultProposalVisibility || 'customer_visible'),
    },
    flags,
  };
}
