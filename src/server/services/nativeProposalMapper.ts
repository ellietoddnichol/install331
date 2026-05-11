import type { EstimateSummary, ProjectRecord, ProposalVisibility, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { computeProjectConditionEffects, normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';
import { calculateEstimateSummary } from './estimateEngineV1.ts';

function num(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function parseProposalVisibility(raw: unknown): ProposalVisibility | undefined {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'customer_visible' || s === 'internal_only' || s === 'optional_or_alt') return s as ProposalVisibility;
  return undefined;
}

const NOW = () => new Date().toISOString();

/**
 * Maps `v_estimate_lines_customer` rows → `TakeoffLineRecord` for `proposalDocument` / `ProposalPreview`.
 *
 * **Contract:** `proposalDocument.buildProposalScheduleSections` multiplies `materialCost`, `laborCost`,
 * and `laborMinutes` by `qty` (same as `estimateEngineV1`). DB views often expose *extended* dollars;
 * this mapper divides by qty when needed.
 */
export function mapCustomerEstimateLinesToTakeoffLike(
  rows: Record<string, unknown>[],
  projectId: string,
  defaultRoomId: string
): TakeoffLineRecord[] {
  return rows.map((row, idx) => {
    const id = str(row, 'id', 'estimate_line_id', 'line_id') || `native-est-line-${idx}`;
    const qty = Math.max(num(row, 'qty', 'quantity', 'bill_qty'), 0.000_001);
    const extMaterial = num(row, 'material_extended', 'extended_material', 'material_total', 'line_material_total');
    const extLabor = num(row, 'labor_extended', 'extended_labor', 'labor_total', 'line_labor_total');
    const unitMaterialFromCols = num(row, 'material_unit_cost', 'unit_material_cost', 'material_unit_price');
    const unitLaborFromCols = num(row, 'labor_unit_cost', 'unit_labor_cost', 'labor_unit_price');
    const materialUnit =
      unitMaterialFromCols > 0 ? unitMaterialFromCols : extMaterial > 0 ? extMaterial / qty : num(row, 'material_cost', 'material_amount') / Math.max(qty, 1);
    const laborUnit =
      unitLaborFromCols > 0 ? unitLaborFromCols : extLabor > 0 ? extLabor / qty : num(row, 'labor_cost', 'labor_amount') / Math.max(qty, 1);

    const laborMinutesTotal = num(row, 'labor_minutes', 'total_labor_minutes', 'labor_minutes_total');
    const laborMinutesPerUnit =
      num(row, 'labor_minutes_per_unit', 'labor_minutes_each') ||
      (laborMinutesTotal > 0 ? laborMinutesTotal / qty : 0);

    const vis = parseProposalVisibility(row.proposal_visibility ?? row.visibility);
    const lineTotal = num(row, 'line_total', 'extended_total', 'total_sell', 'customer_line_total');
    const unitSell = lineTotal > 0 ? lineTotal / qty : materialUnit + laborUnit;

    return {
      id,
      projectId,
      roomId: str(row, 'room_id', 'area_id', 'project_area_id') || defaultRoomId,
      sourceType: str(row, 'source_type', 'line_source') || 'estimate_line',
      sourceRef: str(row, 'takeoff_row_id', 'takeoff_upload_id') || null,
      description: str(row, 'customer_description', 'description', 'line_description', 'proposal_description', 'item_description') || 'Line',
      proposalVisibility: vis,
      proposalDescriptionOverride: str(row, 'proposal_description_override', 'customer_description_override') || null,
      parentEstimateLineId: str(row, 'parent_estimate_line_id', 'parent_line_id') || null,
      sourceLineType: (str(row, 'source_line_type', 'line_type') || 'catalog_item') as TakeoffLineRecord['sourceLineType'],
      sku: str(row, 'sku', 'item_sku', 'catalog_sku') || null,
      category: str(row, 'category', 'line_category') || null,
      subcategory: str(row, 'subcategory', 'line_subcategory') || null,
      baseType: str(row, 'base_type', 'material_family') || null,
      qty,
      unit: str(row, 'unit', 'uom', 'bill_uom') || 'EA',
      materialCost: Number(materialUnit.toFixed(4)),
      baseMaterialCost: Number(materialUnit.toFixed(4)),
      laborMinutes: Number(laborMinutesPerUnit.toFixed(4)),
      laborCost: Number(laborUnit.toFixed(4)),
      baseLaborCost: Number(laborUnit.toFixed(4)),
      pricingSource: 'auto',
      unitSell: Number(unitSell.toFixed(4)),
      lineTotal: Number((lineTotal || (materialUnit + laborUnit) * qty).toFixed(2)),
      notes: str(row, 'notes', 'line_notes') || null,
      bundleId: str(row, 'bundle_id') || null,
      catalogItemId: str(row, 'catalog_item_id', 'catalog_item') || null,
      variantId: null,
      sourceManufacturer: str(row, 'manufacturer', 'mfr') || null,
      sourceBidBucket: str(row, 'bid_bucket', 'source_bid_bucket', 'proposal_bucket', 'scope_bucket') || null,
      sourceSectionHeader: str(row, 'section_header', 'source_section_header') || null,
      laborOrigin: (str(row, 'labor_origin', 'labor_source') as TakeoffLineRecord['laborOrigin']) || null,
      createdAt: str(row, 'created_at') || NOW(),
      updatedAt: str(row, 'updated_at', 'created_at') || NOW(),
    };
  });
}

/**
 * Maps `v_estimate_summary` → `EstimateSummary`. Unknown columns fall back to zeros / project-derived
 * condition multipliers so `ProposalPreview` can render.
 */
export function mapEstimateSummaryViewToEstimateSummary(
  row: Record<string, unknown> | null,
  project: ProjectRecord,
  mappedLines: TakeoffLineRecord[]
): EstimateSummary | null {
  if (!row) {
    return null;
  }

  const materialSubtotal = num(
    row,
    'material_subtotal',
    'customer_material_subtotal',
    'total_material',
    'material_sell_subtotal'
  );
  const laborSubtotal = num(row, 'labor_subtotal', 'total_labor', 'labor_sell_subtotal', 'adjusted_labor_subtotal');
  const adjustedLaborSubtotal = num(row, 'adjusted_labor_subtotal', 'labor_loaded_subtotal', 'labor_subtotal');
  const totalLaborMinutes = num(row, 'total_labor_minutes', 'labor_minutes_total');
  const totalLaborHours = num(row, 'total_labor_hours', 'labor_hours_total') || (totalLaborMinutes > 0 ? totalLaborMinutes / 60 : 0);
  const durationDays = num(row, 'duration_days', 'install_duration_days');
  const durationWeeks = num(row, 'duration_weeks', 'install_duration_weeks');
  const lineSubtotal = num(row, 'line_subtotal', 'subtotal_before_tax');
  const baseBidTotal = num(row, 'base_bid_total', 'grand_total', 'customer_total', 'proposal_total', 'total_sell');

  const conditionLaborMultiplier = num(row, 'condition_labor_multiplier', 'labor_condition_multiplier') || 1;
  const conditionLaborHoursMultiplier = num(row, 'condition_labor_hours_multiplier', 'labor_hours_multiplier') || 1;

  const laborCompanionRaw = mappedLines.reduce((s, l) => s + l.laborCost * l.qty, 0);
  const materialForBid = mappedLines.reduce((s, l) => s + l.materialCost * l.qty, 0);
  const effects = computeProjectConditionEffects(project, laborCompanionRaw, materialForBid, materialForBid + laborCompanionRaw);

  const job = normalizeProjectJobConditions(project.jobConditions);
  const paid = job.installerPaidDayHours;
  const breakH = job.dailyBreakHoursPerInstaller;
  const setupCleanup = job.fieldSetupCleanupHoursPerInstallerDay;
  const productiveHrsPerInstaller = Math.max(0.25, paid - breakH - setupCleanup);
  const productiveCrewHoursPerDay =
    num(row, 'productive_crew_hours_per_day') ||
    Number((productiveHrsPerInstaller * Math.max(1, job.installerCount)).toFixed(2));

  return {
    materialSubtotal: materialSubtotal || materialForBid,
    laborSubtotal: laborSubtotal || laborCompanionRaw,
    adjustedLaborSubtotal: adjustedLaborSubtotal || laborCompanionRaw + effects.laborAdjustmentAmount,
    totalLaborMinutes: totalLaborMinutes || mappedLines.reduce((s, l) => s + l.laborMinutes * l.qty, 0),
    totalLaborHours: totalLaborHours || 0,
    durationDays: durationDays || 0,
    durationWeeks: durationWeeks || 0,
    lineSubtotal: lineSubtotal || materialForBid + laborCompanionRaw,
    conditionAdjustmentAmount: num(row, 'condition_adjustment_amount') || effects.totalConditionAdjustment,
    conditionLaborMultiplier: conditionLaborMultiplier || effects.laborCostMultiplier,
    conditionLaborHoursMultiplier: conditionLaborHoursMultiplier || effects.laborHoursMultiplier,
    burdenAmount: num(row, 'burden_amount', 'labor_burden_amount'),
    overheadAmount: num(row, 'overhead_amount', 'material_overhead_amount'),
    profitAmount: num(row, 'profit_amount', 'material_profit_amount'),
    taxAmount: num(row, 'tax_amount'),
    laborOverheadAmount: num(row, 'labor_overhead_amount'),
    laborProfitAmount: num(row, 'labor_profit_amount'),
    subLaborManagementFeeAmount: num(row, 'sub_labor_management_fee_amount', 'sub_labor_fee_amount'),
    materialLoadedSubtotal: num(row, 'material_loaded_subtotal', 'material_sell_total'),
    laborLoadedSubtotal: num(row, 'labor_loaded_subtotal', 'labor_sell_total'),
    laborCompanionProposalTotal: num(row, 'labor_companion_total', 'labor_loaded_subtotal', 'labor_sell_total'),
    baseBidTotal: baseBidTotal || num(row, 'total', 'sell_total'),
    conditionAssumptions: Array.isArray(row.condition_assumptions)
      ? (row.condition_assumptions as string[])
      : effects.assumptions.length
        ? [...effects.assumptions]
        : [],
    projectConditions: effects.projectConditions,
    productiveCrewHoursPerDay,
    materialWasteAllowanceAmount: 0,
    installerFieldSuppliesAmount: 0,
    laborLearningCurveAllowanceAmount: 0,
    crewRecommendation: undefined,
  };
}

/** Prefer DB summary view; if absent, derive from mapped lines + project engine (still server-side). */
export async function resolveNativeProposalSummary(
  project: ProjectRecord,
  summaryRow: Record<string, unknown> | null,
  mappedLines: TakeoffLineRecord[]
): Promise<EstimateSummary> {
  const fromView = mapEstimateSummaryViewToEstimateSummary(summaryRow, project, mappedLines);
  if (summaryRow && fromView) {
    return fromView;
  }
  if (mappedLines.length > 0) {
    return calculateEstimateSummary(project, mappedLines);
  }
  return fromView ?? calculateEstimateSummary(project, []);
}
