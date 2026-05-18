import type { CatalogItem } from '../../types.ts';
import type { SourceQuoteLineRecord, SourceQuoteRecord, SourceQuoteRowType, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { classifyQuoteRow } from '../../shared/utils/quoteStagingParser.ts';
import { prepareCatalogMatch } from './intakeCatalogMatching.ts';
import { evaluateInstallability } from './intake/installabilityRules.ts';
import { getInstallLaborFamily } from './intake/installLaborFamilies.ts';

export interface QuoteImportResolvedLine {
  createInput: Partial<TakeoffLineRecord> & {
    projectId: string;
    roomId: string;
    description: string;
  };
  flags: string[];
}

const LABOR_MATCH_RULES: Array<{ pattern: RegExp; familyKey: string }> = [
  { pattern: /\block\b|\blatch\b|\bhinge\b|\bhardware\b/, familyKey: 'partition_hardware' },
  { pattern: /\btrim\b|\bbase\s*trim\b|\bfiller\s*panel\b/, familyKey: 'locker' },
  { pattern: /\blocker\b|\bcubbie\b/, familyKey: 'locker' },
  { pattern: /\bgrab\s*bar\b/, familyKey: 'grab_bar' },
  { pattern: /\bmirror\b/, familyKey: 'mirror' },
  { pattern: /\bpartition\b|\bstall\b|\burinal\s*screen\b|\bpilaster\b/, familyKey: 'partition_compartment' },
  { pattern: /\bsoap\b|\btowel\b|\bdryer\b|\bdispenser\b|\btissue\b|\bnapkin\b/, familyKey: 'accessory_generic' },
  { pattern: /\bwall\s*protection\b|\bcrash\s*rail\b|\bcorner\s*guard\b/, familyKey: 'wall_protection' },
];

function normalizeCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function categoryFallbackFamilyKey(category: string, description: string): string | null {
  const hay = `${category} ${description}`.toLowerCase();
  if (/grab\s*bar/.test(hay)) return 'grab_bar';
  if (/mirror/.test(hay)) return 'mirror';
  if (/partition|stall|urinal\s*screen|pilaster/.test(hay)) return 'partition_compartment';
  if (/soap|towel|dryer|tissue|napkin|dispenser|toilet\s*accessor/.test(hay)) return 'accessory_generic';
  if (/locker/.test(hay)) return 'locker';
  if (/wall\s*protection|crash\s*rail|chair\s*rail|corner\s*guard/.test(hay)) return 'wall_protection';
  return null;
}

function laborFamilyRuleMatch(description: string): string | null {
  const hay = String(description || '').toLowerCase();
  for (const rule of LABOR_MATCH_RULES) {
    if (rule.pattern.test(hay)) return rule.familyKey;
  }
  return null;
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

  const laborFamilyRuleKey = laborFamilyRuleMatch(normalizedDescription);
  const categoryFallbackKey = categoryFallbackFamilyKey(category || '', normalizedDescription);
  const installFamilyKey =
    matchedCatalogItem?.installLaborFamily
      || getInstallLaborFamily(installability.installScopeType)?.key
      || getInstallLaborFamily(laborFamilyRuleKey)?.key
      || getInstallLaborFamily(categoryFallbackKey)?.key
      || null;

  const installFamily = getInstallLaborFamily(installFamilyKey);
  const vendorServiceRow = rowType === 'installation' || rowType === 'service';
  const catalogLaborEligible = rowType === 'material' || rowType === 'accessory';

  const catalogLaborMinutes = Number(matchedCatalogItem?.baseLaborMinutes || 0);
  const fallbackMinutes = Number(installFamily?.defaultInstallMinutes || 0);

  let laborMinutes = 0;
  let generatedLaborMinutes: number | null = null;
  let laborOrigin: TakeoffLineRecord['laborOrigin'] = null;

  if (rowType === 'freight') {
    laborMinutes = 0;
    laborOrigin = 'source';
    flags.push('Freight row — cost add-in only; internal install labor suppressed.');
  } else if (vendorServiceRow) {
    laborMinutes = 0;
    laborOrigin = 'source';
    flags.push('Vendor installation/service row — Brighten labor fallback suppressed.');
  } else if (catalogLaborEligible && catalogLaborMinutes > 0) {
    laborMinutes = catalogLaborMinutes;
    laborOrigin = 'catalog';
    flags.push('Labor baseline from catalog match.');
  } else if (catalogLaborEligible && fallbackMinutes > 0) {
    laborMinutes = fallbackMinutes;
    generatedLaborMinutes = fallbackMinutes;
    laborOrigin = 'install_family';
    flags.push(`Install labor generated from labor family ${installFamily?.label || installFamilyKey}.`);
  } else {
    laborMinutes = 0;
    laborOrigin = null;
    flags.push('Manual labor assignment required (no catalog or labor-family baseline).');
  }

  if (exactMatch) {
    flags.push('Catalog match: exact SKU/model.');
  } else if (aliasOrModelMatch) {
    flags.push('Catalog match: alias/SKU/model fallback.');
  } else if (preparedMatch) {
    flags.push('Catalog match: fuzzy description fallback.');
  }

  if (!matchedCatalogItem && laborFamilyRuleKey) {
    flags.push(`Labor family matched by deterministic rule (${laborFamilyRuleKey}).`);
  }
  if (!matchedCatalogItem && !laborFamilyRuleKey && categoryFallbackKey) {
    flags.push(`Labor family matched by category fallback (${categoryFallbackKey}).`);
  }

  const unitMaterial =
    Number(input.line.materialCost || 0)
    || Number(input.line.unitCost || 0)
    || (Number(input.line.totalCost || 0) > 0 && Number(input.line.qty || 0) > 0
      ? Number(input.line.totalCost || 0) / Number(input.line.qty || 1)
      : 0);

  const manualLaborFlag = flags.find((f) => f.toLowerCase().includes('manual labor assignment required'));
  const mergedNotes = [
    input.line.notes,
    `Source row type: ${rowType}`,
    manualLaborFlag,
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
