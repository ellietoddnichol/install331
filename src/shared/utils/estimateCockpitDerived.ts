import type { PricingMode, TakeoffLineRecord } from '../types/estimator';
import { isMaterialOnlyMainBid } from '../types/estimator';
import { shouldIncludeLineInEstimateHealth } from './estimateLineHealth';

/** Primary cockpit grouping — each line appears in exactly one bucket. */
export type EstimateCockpitRowGroup = 'vendor_quote' | 'manual_catalog' | 'allowance_alt_note';

export function cockpitRowGroupForLine(line: TakeoffLineRecord): EstimateCockpitRowGroup {
  if (line.sourceType === 'vendor_quote') return 'vendor_quote';

  const isAltBucket =
    line.proposalVisibility === 'optional_or_alt' ||
    line.sourceLineType === 'quote_subtotal' ||
    line.sourceLineType === 'add_in';

  if (isAltBucket) return 'allowance_alt_note';

  return 'manual_catalog';
}

export function groupEstimateLinesForCockpit(lines: TakeoffLineRecord[]): Array<{
  group: EstimateCockpitRowGroup;
  lines: TakeoffLineRecord[];
}> {
  const buckets: Record<EstimateCockpitRowGroup, TakeoffLineRecord[]> = {
    vendor_quote: [],
    manual_catalog: [],
    allowance_alt_note: [],
  };
  for (const line of lines) {
    buckets[cockpitRowGroupForLine(line)].push(line);
  }

  const order: EstimateCockpitRowGroup[] = ['vendor_quote', 'manual_catalog', 'allowance_alt_note'];
  return order.filter((g) => buckets[g].length > 0).map((g) => ({ group: g, lines: buckets[g] }));
}

export type EstimateLaborBasisUiKind = 'matched' | 'fallback' | 'manual' | 'needs';

export interface EstimateLaborBasisUi {
  kind: EstimateLaborBasisUiKind;
  /** Calm label for grid UI */
  label: string;
}

/**
 * Frontend-safe mapping from persisted labor fields to cockpit labels.
 * TODO(backend): expose an explicit `laborResolution` enum on takeoff lines once the engine
 * materializes exact-match vs category fallback vs suppressed-for-scope vs estimator override.
 */
export function deriveEstimateLaborBasisUi(line: TakeoffLineRecord, pricingMode: PricingMode): EstimateLaborBasisUi {
  const showLabor = !isMaterialOnlyMainBid(pricingMode);
  if (!showLabor) {
    return { kind: 'matched', label: 'Labor matched' };
  }

  if (!shouldIncludeLineInEstimateHealth(line)) {
    return { kind: 'matched', label: 'Labor matched' };
  }

  const laborMin = Number(line.laborMinutes);
  const genMin = Number(line.generatedLaborMinutes ?? NaN);
  const laborCost = Number(line.laborCost);
  const hasMinutes = Number.isFinite(laborMin) && laborMin > 0;
  const hasGenerated = Number.isFinite(genMin) && genMin > 0;
  const hasLaborMoney = Number.isFinite(laborCost) && laborCost > 0;

  if (!hasMinutes && !hasLaborMoney && !hasGenerated) {
    return { kind: 'needs', label: 'Needs labor' };
  }

  const origin = line.laborOrigin ?? null;
  if (origin === 'install_family') {
    return { kind: 'fallback', label: 'Labor fallback' };
  }
  if (origin === 'catalog' || origin === 'source') {
    return { kind: 'matched', label: 'Labor matched' };
  }

  // Legacy / unknown origin but estimator entered minutes or server wrote labor cost.
  if (hasMinutes || hasLaborMoney) {
    return { kind: 'manual', label: 'Manual labor' };
  }

  return { kind: 'needs', label: 'Needs labor' };
}

/** Short status for the line grid — overlaps health strip signals without duplicating full engine logic. */
export function deriveLineAttentionHint(line: TakeoffLineRecord, pricingMode: PricingMode): string | null {
  if (!shouldIncludeLineInEstimateHealth(line)) return null;

  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = !isMaterialOnlyMainBid(pricingMode);
  const parts: string[] = [];

  if (showMaterial) {
    const mat = Number(line.materialCost);
    if (!Number.isFinite(mat) || mat <= 0) parts.push('Material');
  }

  const laborUi = deriveEstimateLaborBasisUi(line, pricingMode);
  if (showLabor && laborUi.kind === 'needs') parts.push('Labor');

  if (showLabor && line.laborOrigin === 'install_family') {
    const fam = String(line.installLaborFamily ?? '').trim();
    if (!fam) parts.push('Install family');
  }

  if (!line.catalogItemId && line.sourceType === 'vendor_quote') {
    parts.push('Catalog review');
  }

  return parts.length ? parts.join(' · ') : null;
}
