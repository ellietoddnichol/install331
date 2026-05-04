import type { TakeoffLineRecord } from '../types/estimator.ts';

/**
 * Billable labor dollars for a line: uses stored unit labor cost when present,
 * otherwise derives from install minutes × subcontractor rate (material-only bids often leave labor cost at 0).
 */
export function extendedLaborDollarsForLine(line: TakeoffLineRecord, laborRatePerHour: number): number {
  const qty = Number(line.qty || 0);
  const unitLabor = Number(line.laborCost || 0);
  const ext = unitLabor * qty;
  if (ext > 0.0001) return ext;
  const minutes = Number(line.laborMinutes || 0) * qty;
  if (minutes <= 0) return 0;
  const rate = Number.isFinite(Number(laborRatePerHour)) && Number(laborRatePerHour) > 0 ? Number(laborRatePerHour) : 100;
  return Number(((minutes / 60) * rate).toFixed(2));
}
