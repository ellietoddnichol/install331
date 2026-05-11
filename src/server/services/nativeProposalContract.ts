import type { EstimateSummary, TakeoffLineRecord } from '../../shared/types/estimator.ts';

export type NativeProposalContractWarning = string;

/** Best-effort checks before the UI relies on mapped proposal payloads. */
export function collectNativeProposalContractWarnings(
  customerRows: Record<string, unknown>[],
  summaryRow: Record<string, unknown> | null,
  mappedLines: TakeoffLineRecord[],
  mappedSummary: EstimateSummary | null
): NativeProposalContractWarning[] {
  const w: NativeProposalContractWarning[] = [];
  if (customerRows.length === 0) {
    w.push('v_estimate_lines_customer returned no rows for this estimate.');
  }
  if (!summaryRow) {
    w.push('v_estimate_summary returned no row for this estimate.');
  }
  if (mappedLines.length > 0) {
    const anyQty = mappedLines.some((l) => Number(l.qty) > 0);
    if (!anyQty) w.push('Mapped proposal lines all have zero qty — check qty / quantity columns on v_estimate_lines_customer.');
  }
  if (mappedSummary && !Number.isFinite(mappedSummary.baseBidTotal)) {
    w.push('Mapped summary has non-finite baseBidTotal.');
  }
  return w;
}
