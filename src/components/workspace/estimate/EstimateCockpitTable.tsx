import React from 'react';
import type { PricingMode, ProposalVisibility, TakeoffLineRecord } from '../../../shared/types/estimator';
import { isMaterialOnlyMainBid } from '../../../shared/types/estimator';
import {
  type EstimateCockpitRowGroup,
  deriveEstimateLaborBasisUi,
  deriveLineAttentionHint,
  groupEstimateLinesForCockpit,
} from '../../../shared/utils/estimateCockpitDerived';
import { deriveInstallAssumptionGateUi } from '../../../shared/utils/installIntelligenceLineUi';
import {
  InstallAssumptionGateBadge,
  InstallAssumptionLaborBlockedHint,
} from './InstallAssumptionGateCallout';
import { formatCurrencySafe, formatLaborDurationMinutes, formatNumberSafe } from '../../../utils/numberFormat';

const GROUP_LABEL: Record<EstimateCockpitRowGroup, string> = {
  vendor_quote: 'Imported from vendor quotes',
  manual_catalog: 'Manual estimate lines',
  allowance_alt_note: 'Allowances · alternates · notes',
};

interface EstimateCockpitTableProps {
  lines: TakeoffLineRecord[];
  pricingMode: PricingMode;
  laborMultiplier: number;
  selectedLineId: string | null;
  healthHighlightLineIds: ReadonlySet<string> | null;
  onSelectLine: (lineId: string) => void;
  onOpenLineDetail?: (lineId: string) => void;
  /** Proposal-facing inclusion — excludes internal-only lines from typical bid presentation. */
  onToggleInclude: (lineId: string, nextIncluded: boolean) => void;
  onReviewInstallAssumptions?: (lineId: string) => void;
}

export function EstimateCockpitTable({
  lines,
  pricingMode,
  laborMultiplier,
  selectedLineId,
  healthHighlightLineIds,
  onSelectLine,
  onOpenLineDetail,
  onToggleInclude,
  onReviewInstallAssumptions,
}: EstimateCockpitTableProps) {
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = !isMaterialOnlyMainBid(pricingMode);

  const grouped = React.useMemo(() => groupEstimateLinesForCockpit(lines), [lines]);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border border-app-line bg-app-surface shadow-sm">
      <table className="w-full min-w-[1100px] border-collapse text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-app-surface-soft/95 backdrop-blur-sm">
          <tr className="border-b border-app-line text-[10px] font-semibold uppercase tracking-wide text-app-muted">
            <th className="whitespace-nowrap px-2 py-2">Include</th>
            <th className="min-w-[14rem] px-2 py-2">Description</th>
            <th className="whitespace-nowrap px-2 py-2">Qty</th>
            <th className="whitespace-nowrap px-2 py-2">Unit</th>
            {showMaterial ? (
              <>
                <th className="whitespace-nowrap px-2 py-2">Mat / unit</th>
                <th className="whitespace-nowrap px-2 py-2">Mat total</th>
              </>
            ) : null}
            {showLabor ? (
              <>
                <th className="min-w-[7rem] whitespace-nowrap px-2 py-2">Labor basis</th>
                <th className="whitespace-nowrap px-2 py-2">Labor total</th>
              </>
            ) : null}
            <th className="min-w-[8rem] px-2 py-2">Modifiers</th>
            <th className="whitespace-nowrap px-2 py-2">Total</th>
            <th className="min-w-[9rem] px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ group, lines: groupLines }) => (
            <React.Fragment key={group}>
              <tr className="bg-app-brand-deep/8">
                <td colSpan={99} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-app">
                  {GROUP_LABEL[group]}
                </td>
              </tr>
              {groupLines.map((line) => (
                <CockpitRow
                  key={line.id}
                  line={line}
                  pricingMode={pricingMode}
                  laborMultiplier={laborMultiplier}
                  selected={line.id === selectedLineId}
                  healthHighlight={healthHighlightLineIds?.has(line.id) ?? false}
                  showMaterial={showMaterial}
                  showLabor={showLabor}
                  onSelect={() => onSelectLine(line.id)}
                  onOpenLineDetail={
                    onOpenLineDetail ? () => onOpenLineDetail(line.id) : undefined
                  }
                  onToggleInclude={(next) => onToggleInclude(line.id, next)}
                  onReviewInstallAssumptions={
                    onReviewInstallAssumptions
                      ? () => onReviewInstallAssumptions(line.id)
                      : undefined
                  }
                />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CockpitRow(props: {
  line: TakeoffLineRecord;
  pricingMode: PricingMode;
  laborMultiplier: number;
  selected: boolean;
  healthHighlight: boolean;
  showMaterial: boolean;
  showLabor: boolean;
  onSelect: () => void;
  onOpenLineDetail?: () => void;
  onToggleInclude: (included: boolean) => void;
  onReviewInstallAssumptions?: () => void;
}) {
  const {
    line,
    pricingMode,
    laborMultiplier,
    selected,
    healthHighlight,
    showMaterial,
    showLabor,
    onSelect,
    onOpenLineDetail,
    onToggleInclude,
    onReviewInstallAssumptions,
  } = props;

  const qty = Number(line.qty) || 0;
  const matUnit = Number(line.materialCost) || 0;
  const matTotal = matUnit * qty;
  const laborExtended =
    (Number(line.laborCost) || 0) * qty * Math.max(0.001, laborMultiplier || 1);
  const laborBasis = deriveEstimateLaborBasisUi(line, pricingMode);
  const installGate = deriveInstallAssumptionGateUi(line, pricingMode);
  const extMinutes = (Number(line.laborMinutes) || 0) * qty;
  const mods = (line.modifierNames && line.modifierNames.length > 0
    ? line.modifierNames
    : []
  ).join(' · ');
  const attention = deriveLineAttentionHint(line, pricingMode);
  const included = line.proposalVisibility !== 'internal_only';

  const vendor = line.sourceType === 'vendor_quote';

  return (
    <tr
      className={`cursor-pointer border-b border-app-line/80 transition-colors ${
        selected ? 'bg-blue-50/90 ring-1 ring-inset ring-blue-200/80' : 'hover:bg-app-surface-soft/80'
      } ${healthHighlight ? 'bg-amber-50/50' : ''}`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.preventDefault();
        onOpenLineDetail?.();
      }}
    >
      <td className="align-top px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onToggleInclude(e.target.checked)}
          aria-label={`Include ${line.description} on proposal`}
          className="h-4 w-4 rounded border-app-line text-app-brand-deep focus:ring-app-brand"
        />
      </td>
      <td className="max-w-md align-top px-2 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {vendor ? (
            <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-900 ring-1 ring-violet-100">
              Vendor quote
            </span>
          ) : null}
          {installGate.badgeLabel ? <InstallAssumptionGateBadge label={installGate.badgeLabel} /> : null}
          <span className="font-medium text-app">{line.description || '—'}</span>
          {onOpenLineDetail ? (
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLineDetail();
              }}
            >
              Detail
            </button>
          ) : null}
        </div>
        {line.sourceRef ? (
          <p className="mt-0.5 truncate text-[10px] text-app-muted" title={`${line.sourceType}:${line.sourceRef}`}>
            Ref · {line.sourceType}:{line.sourceRef}
          </p>
        ) : (
          <p className="mt-0.5 text-[10px] text-app-muted">{line.sourceType}</p>
        )}
      </td>
      <td className="align-top tabular-nums px-2 py-2">{formatNumberSafe(line.qty, 2)}</td>
      <td className="align-top px-2 py-2">{line.unit || '—'}</td>
      {showMaterial ? (
        <>
          <td className="align-top tabular-nums px-2 py-2">{formatCurrencySafe(matUnit)}</td>
          <td className="align-top tabular-nums px-2 py-2">{formatCurrencySafe(matTotal)}</td>
        </>
      ) : null}
      {showLabor ? (
        <>
          <td className="align-top px-2 py-2">
            <div className="font-medium text-app">{laborBasis.label}</div>
            {installGate.isGated ? (
              <InstallAssumptionLaborBlockedHint gate={installGate} compact />
            ) : installGate.isVendorLaborSuppressed ? (
              <p className="mt-0.5 text-[10px] text-app-muted">{installGate.vendorLaborSuppressedLabel}</p>
            ) : (
              <div className="text-[10px] text-app-muted">{formatLaborDurationMinutes(extMinutes)} total</div>
            )}
          </td>
          <td className="align-top tabular-nums px-2 py-2">{formatCurrencySafe(laborExtended)}</td>
        </>
      ) : null}
      <td className="align-top px-2 py-2 text-[11px] text-app-muted">{mods || '—'}</td>
      <td className="align-top tabular-nums px-2 py-2 font-semibold text-app">{formatCurrencySafe(line.lineTotal)}</td>
      <td className="align-top px-2 py-2">
        {installGate.isGated ? (
          <div className="space-y-1">
            {installGate.badgeLabel ? (
              <InstallAssumptionGateBadge label={installGate.badgeLabel} />
            ) : null}
            {onReviewInstallAssumptions ? (
              <button
                type="button"
                className="block text-left text-[10px] font-semibold text-amber-900 underline decoration-amber-300/80 underline-offset-2 hover:text-amber-950"
                onClick={(e) => {
                  e.stopPropagation();
                  onReviewInstallAssumptions();
                }}
              >
                Review install assumptions
              </button>
            ) : null}
          </div>
        ) : installGate.isVendorLaborSuppressed ? (
          <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
            {installGate.vendorLaborSuppressedLabel}
          </span>
        ) : attention ? (
          <span className="inline-flex rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900 ring-1 ring-rose-100">
            Needs attention · {attention}
          </span>
        ) : (
          <span className="text-[11px] text-emerald-800">Ready</span>
        )}
      </td>
    </tr>
  );
}
