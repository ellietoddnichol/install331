import type { CatalogItem } from '../../types.ts';
import type {
  PricingMode,
  ProjectRecord,
  ProposalVisibility,
  SourceQuoteLineRecord,
  SourceQuoteRecord,
  TakeoffLineRecord,
} from '../types/estimator.ts';
import { isMaterialOnlyMainBid } from '../types/estimator.ts';
import { deriveEstimateLaborBasisUi } from './estimateCockpitDerived.ts';
import {
  parseInstallIntelligenceNotes,
  readSourceRowTypeFromNotes,
} from './installIntelligenceLineUi.ts';
import { parseLineInstallAssumptionsFromNotes, stripInstallIntelligenceMarkersFromNotes } from './lineInstallAssumptions.ts';
import {
  type InstallBlockingStatus,
  readBlockingStatusFromStructuredAssumptions,
} from './projectBlockingAssumptions.ts';
import {
  classifyImportedEstimateLine,
  type QuoteImportLineLaborStatus,
} from './quoteImportResultSummary.ts';

export interface EstimateLineSourceQuoteContext {
  quote: SourceQuoteRecord;
  quoteLine: SourceQuoteLineRecord;
}

export interface EstimateLineDetailModel {
  lineId: string;
  header: {
    description: string;
    qty: number;
    unit: string;
    category: string | null;
    sourceTypeLabel: string;
    laborStatus: QuoteImportLineLaborStatus;
    laborStatusLabel: string;
    laborPauseReason: string | null;
    materialTotal: number;
    laborTotal: number;
    lineTotal: number;
  };
  sourceQuote: {
    linked: boolean;
    vendorLabel: string | null;
    quoteId: string | null;
    description: string | null;
    qty: number | null;
    unit: string | null;
    materialAmount: number | null;
    rowTypeLabel: string | null;
    notes: string | null;
  };
  catalog: {
    matched: boolean;
    description: string | null;
    sku: string | null;
    manufacturer: string | null;
    category: string | null;
    matchConfidence: string | null;
    installLaborFamily: string | null;
  };
  material: {
    unitCost: number;
    total: number;
    taxable: boolean;
    pricingSource: string;
    materialOnlyBid: boolean;
  };
  labor: {
    showLabor: boolean;
    statusLabel: string;
    basisLabel: string;
    basisKind: string;
    paused: boolean;
    pauseMessage: string | null;
    minutes: number;
    extendedMinutes: number;
    unitCost: number;
    extendedCost: number;
    ratePerHour: number;
    multiplier: number;
    origin: string | null;
    generatedMinutes: number | null;
  };
  assumptions: {
    projectWallSubstrate: string | null;
    projectBlockingStatus: InstallBlockingStatus | '';
    projectOccupied: boolean;
    lineOverrides: Record<string, string>;
    hasLineOverrides: boolean;
  };
  modifiers: {
    names: string[];
    rollupSummary: string | null;
  };
  proposal: {
    visibility: ProposalVisibility;
    visibilityLabel: string;
    descriptionOverride: string | null;
    customerClauses: string[];
    hiddenFromProposal: boolean;
  };
  notes: {
    displayText: string;
    internalInstallNotes: string[];
    requiredQuestions: string[];
  };
}

function sourceTypeLabel(sourceType: string | undefined): string {
  switch (sourceType) {
    case 'vendor_quote':
      return 'Vendor quote import';
    case 'catalog':
      return 'Catalog';
    case 'manual':
      return 'Manual entry';
    default:
      return sourceType ? String(sourceType) : 'Unknown';
  }
}

function rowTypeLabel(rowType: string | null | undefined): string {
  switch (rowType) {
    case 'material':
      return 'Material';
    case 'accessory':
      return 'Accessory';
    case 'freight':
      return 'Freight / fee';
    case 'installation':
      return 'Installation';
    case 'service':
      return 'Service';
    case 'note':
      return 'Note / terms';
    case 'ignore':
      return 'Excluded';
    default:
      return rowType || null;
  }
}

function proposalVisibilityLabel(v: ProposalVisibility | undefined): string {
  switch (v) {
    case 'internal_only':
      return 'Hidden from proposal';
    case 'optional_or_alt':
      return 'Allowance / alternate';
    case 'customer_visible':
    default:
      return 'Included in proposal';
  }
}

function laborOriginLabel(origin: TakeoffLineRecord['laborOrigin']): string | null {
  switch (origin) {
    case 'catalog':
      return 'Catalog labor';
    case 'install_family':
      return 'Labor fallback';
    case 'source':
      return 'Source quote labor';
    default:
      return null;
  }
}

function formatConfidence(c: string | null | undefined): string | null {
  if (!c) return null;
  const map: Record<string, string> = {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence',
  };
  return map[c] || c;
}

export function findSourceQuoteContext(
  line: TakeoffLineRecord,
  sourceQuotes: SourceQuoteRecord[],
  allQuoteLines: SourceQuoteLineRecord[],
): EstimateLineSourceQuoteContext | null {
  if (line.sourceType !== 'vendor_quote' || !line.sourceRef) return null;
  const quoteLine = allQuoteLines.find((entry) => entry.id === line.sourceRef);
  if (!quoteLine) return null;
  const quote = sourceQuotes.find((entry) => entry.id === quoteLine.sourceQuoteId);
  if (!quote) return null;
  return { quote, quoteLine };
}

export function buildEstimateLineDetailModel(input: {
  line: TakeoffLineRecord;
  project: Pick<ProjectRecord, 'wallSubstrate' | 'structuredAssumptions' | 'jobConditions'>;
  pricingMode: PricingMode;
  laborRatePerHour: number;
  laborMultiplier?: number;
  sourceQuoteContext?: EstimateLineSourceQuoteContext | null;
  catalogItem?: CatalogItem | null;
}): EstimateLineDetailModel {
  const { line, project, pricingMode } = input;
  const qty = Number(line.qty) || 0;
  const matUnit = Number(line.materialCost) || 0;
  const matTotal = matUnit * qty;
  const laborMult = Math.max(0.001, input.laborMultiplier ?? 1);
  const laborUnit = Number(line.laborCost) || 0;
  const laborTotal = laborUnit * qty * laborMult;
  const classified = classifyImportedEstimateLine(line, pricingMode, project);
  const laborUi = deriveEstimateLaborBasisUi(line, pricingMode);
  const parsed = parseInstallIntelligenceNotes(line.notes);
  const lineOverrides = parseLineInstallAssumptionsFromNotes(line.notes);
  const srcCtx = input.sourceQuoteContext;
  const sourceRowType = readSourceRowTypeFromNotes(line.notes);
  const catalog = input.catalogItem;

  const rollup = line.lineModifierRollup;
  let rollupSummary: string | null = null;
  if (rollup && rollup.count > 0) {
    const parts: string[] = [`${rollup.count} modifier${rollup.count === 1 ? '' : 's'}`];
    if (rollup.addLaborMinutes) parts.push(`+${rollup.addLaborMinutes} min labor`);
    if (rollup.addMaterialCost) parts.push(`+${rollup.addMaterialCost} material`);
    rollupSummary = parts.join(' · ');
  }

  const showLabor = !isMaterialOnlyMainBid(pricingMode);

  return {
    lineId: line.id,
    header: {
      description: line.description || '—',
      qty,
      unit: line.unit || 'EA',
      category: line.category,
      sourceTypeLabel: sourceTypeLabel(line.sourceType),
      laborStatus: classified.laborStatus,
      laborStatusLabel: classified.laborStatusLabel,
      laborPauseReason: classified.reason,
      materialTotal: matTotal,
      laborTotal: showLabor ? laborTotal : 0,
      lineTotal: Number(line.lineTotal) || matTotal + (showLabor ? laborTotal : 0),
    },
    sourceQuote: srcCtx
      ? {
          linked: true,
          vendorLabel: [srcCtx.quote.vendorName, srcCtx.quote.quoteNumber].filter(Boolean).join(' · ') || null,
          quoteId: srcCtx.quote.id,
          description: String(srcCtx.quoteLine.normalizedDescription || srcCtx.quoteLine.rawDescription || '').trim() || null,
          qty: Number(srcCtx.quoteLine.qty) || null,
          unit: srcCtx.quoteLine.unit || null,
          materialAmount:
            Number(srcCtx.quoteLine.materialCost) || Number(srcCtx.quoteLine.unitCost) || null,
          rowTypeLabel: rowTypeLabel(srcCtx.quoteLine.rowType),
          notes: srcCtx.quoteLine.notes,
        }
      : {
          linked: false,
          vendorLabel: null,
          quoteId: null,
          description: null,
          qty: null,
          unit: null,
          materialAmount: null,
          rowTypeLabel: sourceRowType ? rowTypeLabel(sourceRowType) : null,
          notes: null,
        },
    catalog: catalog
      ? {
          matched: true,
          description: catalog.description || null,
          sku: catalog.sku || catalog.model || catalog.modelNumber || null,
          manufacturer: catalog.manufacturer || catalog.brand || null,
          category: catalog.category || null,
          matchConfidence: formatConfidence(line.intakeMatchConfidence),
          installLaborFamily: catalog.installLaborFamily || line.installLaborFamily || null,
        }
      : {
          matched: Boolean(line.catalogItemId),
          description: line.catalogItemId ? 'Catalog item linked' : null,
          sku: line.sku,
          manufacturer: line.sourceManufacturer,
          category: line.category,
          matchConfidence: formatConfidence(line.intakeMatchConfidence),
          installLaborFamily: line.installLaborFamily,
        },
    material: {
      unitCost: matUnit,
      total: matTotal,
      taxable: line.taxable !== false,
      pricingSource: line.pricingSource || 'auto',
      materialOnlyBid: isMaterialOnlyMainBid(pricingMode),
    },
    labor: {
      showLabor,
      statusLabel: classified.laborStatusLabel,
      basisLabel: laborUi.label,
      basisKind: laborUi.kind,
      paused: classified.laborStatus === 'labor_paused',
      pauseMessage: classified.reason,
      minutes: Number(line.laborMinutes) || 0,
      extendedMinutes: (Number(line.laborMinutes) || 0) * qty,
      unitCost: laborUnit,
      extendedCost: laborTotal,
      ratePerHour: input.laborRatePerHour,
      multiplier: laborMult,
      origin: laborOriginLabel(line.laborOrigin),
      generatedMinutes: line.generatedLaborMinutes ?? null,
    },
    assumptions: {
      projectWallSubstrate: project.wallSubstrate,
      projectBlockingStatus: readBlockingStatusFromStructuredAssumptions(project.structuredAssumptions) ?? '',
      projectOccupied: Boolean(project.jobConditions?.occupiedBuilding),
      lineOverrides,
      hasLineOverrides: Object.keys(lineOverrides).length > 0,
    },
    modifiers: {
      names: line.modifierNames || [],
      rollupSummary,
    },
    proposal: {
      visibility: line.proposalVisibility || 'customer_visible',
      visibilityLabel: proposalVisibilityLabel(line.proposalVisibility),
      descriptionOverride: line.proposalDescriptionOverride ?? null,
      customerClauses: parsed.customerProposalClauses,
      hiddenFromProposal: line.proposalVisibility === 'internal_only',
    },
    notes: {
      displayText: stripInstallIntelligenceMarkersFromNotes(line.notes) || '',
      internalInstallNotes: parsed.internalNotes.filter((n) => !/blocking_unknown|install review/i.test(n)),
      requiredQuestions: parsed.requiredQuestions,
    },
  };
}

export function projectAssumptionRows(
  assumptions: EstimateLineDetailModel['assumptions'],
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  rows.push({
    label: 'Wall substrate',
    value: assumptions.projectWallSubstrate || 'Not set',
  });
  rows.push({
    label: 'Blocking / backing',
    value: assumptions.projectBlockingStatus
      ? assumptions.projectBlockingStatus.replace(/_/g, ' ')
      : 'Not set',
  });
  rows.push({
    label: 'Work condition',
    value: assumptions.projectOccupied ? 'Occupied space' : 'Standard access',
  });
  return rows;
}

export function lineOverrideRows(
  overrides: Record<string, string>,
): Array<{ label: string; value: string }> {
  return Object.entries(overrides).map(([key, value]) => ({
    label: key.replace(/_/g, ' '),
    value,
  }));
}
