import React from 'react';
import type { InvestmentBreakdownRow } from '../../shared/utils/proposalDocument';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface ProposalInvestmentSummaryTableProps {
  durationLabel: string;
  rows: InvestmentBreakdownRow[];
  /** Tighter padding for condensed proposal format */
  compact?: boolean;
  className?: string;
}

/** Formal investment breakdown — used at end of proposal, not as top summary cards. */
export function ProposalInvestmentSummaryTable({
  durationLabel,
  rows,
  compact = false,
  className = '',
}: ProposalInvestmentSummaryTableProps) {
  const pad = compact ? 'px-3 py-2' : 'px-4 py-2.5';
  const totalPad = compact ? 'px-3 py-3' : 'px-4 py-3.5';

  return (
    <div className={`border border-slate-300 bg-white ${className}`.trim()}>
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          <tr className="border-b border-slate-200">
            <td className={`${pad} text-slate-600`}>Estimated duration</td>
            <td className={`${pad} text-right font-semibold tabular-nums text-slate-900`}>{durationLabel}</td>
          </tr>
          {rows.map((row, idx) => {
            if (row.isSectionBreak) {
              return (
                <tr key={`${row.label}-${idx}`} className="border-b border-slate-200 bg-slate-50/70">
                  <td colSpan={2} className={`${pad} text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700`}>
                    {row.label}
                  </td>
                </tr>
              );
            }
            if (row.isTotal) {
              return (
                <tr key={`${row.label}-${idx}`} className="border-t-2 border-slate-900 bg-slate-50">
                  <td className={`${totalPad} text-[15px] font-bold text-slate-950`}>Total investment</td>
                  <td className={`${totalPad} text-right text-[15px] font-bold tabular-nums text-slate-950`}>
                    {formatCurrencySafe(row.amount)}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={`${row.label}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                <td className={`${pad} text-slate-600`}>{row.label}</td>
                <td className={`${pad} text-right font-medium tabular-nums text-slate-900`}>
                  {formatCurrencySafe(row.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
