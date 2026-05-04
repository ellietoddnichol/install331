import type { PricingMode, TakeoffLineRecord } from '../types/estimator';
import { isMaterialOnlyMainBid } from '../types/estimator';

export type EstimateHealthFocus = 'material' | 'labor' | 'installFamily';

/** Skip non-priced / non-owned scope so the strip stays signal-heavy. */
export function shouldIncludeLineInEstimateHealth(line: TakeoffLineRecord): boolean {
  const b = line.intakeScopeBucket ?? null;
  if (b === 'informational_only' || b === 'excluded_by_others') return false;
  return true;
}

export interface EstimateLineHealthDerived {
  missingMaterial: { count: number; lineIds: string[] };
  missingLabor: { count: number; lineIds: string[] };
  missingInstallFamily: { count: number; lineIds: string[] };
  /** Distinct lines with at least one issue above. */
  attentionLineCount: number;
  attentionLineIds: string[];
}

export function deriveEstimateLineHealth(
  lines: TakeoffLineRecord[],
  pricingMode: PricingMode
): EstimateLineHealthDerived {
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = !isMaterialOnlyMainBid(pricingMode);

  const missingMaterial: string[] = [];
  const missingLabor: string[] = [];
  const missingInstallFamily: string[] = [];

  for (const line of lines) {
    if (!shouldIncludeLineInEstimateHealth(line)) continue;

    if (showMaterial) {
      const mat = Number(line.materialCost);
      if (!Number.isFinite(mat) || mat <= 0) missingMaterial.push(line.id);
    }

    if (showLabor) {
      const min = Number(line.laborMinutes);
      if (!Number.isFinite(min) || min <= 0) missingLabor.push(line.id);
    }

    if (line.laborOrigin === 'install_family') {
      const fam = String(line.installLaborFamily ?? '').trim();
      if (!fam) missingInstallFamily.push(line.id);
    }
  }

  const attention = new Set<string>([
    ...missingMaterial,
    ...missingLabor,
    ...missingInstallFamily,
  ]);

  return {
    missingMaterial: { count: missingMaterial.length, lineIds: missingMaterial },
    missingLabor: { count: missingLabor.length, lineIds: missingLabor },
    missingInstallFamily: { count: missingInstallFamily.length, lineIds: missingInstallFamily },
    attentionLineCount: attention.size,
    attentionLineIds: Array.from(attention),
  };
}
