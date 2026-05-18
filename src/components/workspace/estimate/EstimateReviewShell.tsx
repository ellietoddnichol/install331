import React, { useMemo, useState } from 'react';
import type { PricingMode, TakeoffLineRecord } from '../../../shared/types/estimator';
import { deriveInstallAssumptionGateUi } from '../../../shared/utils/installIntelligenceLineUi';
import { isMaterialOnlyMainBid } from '../../../shared/types/estimator';
import { formatCurrencySafe } from '../../../utils/numberFormat';
import {
  FieldOpsAlertBanner,
  FieldOpsPageHeader,
  FieldOpsStickyFooter,
  FieldOpsTabs,
} from '../../fieldops/FieldOpsPrimitives';

type EstimateReviewTab = 'lines' | 'assumptions' | 'blocking' | 'notes';

export function EstimateReviewShell(props: {
  projectName: string;
  lines: TakeoffLineRecord[];
  pricingMode: PricingMode;
  materialTotal: number;
  laborTotal: number;
  grandTotal: number;
  onReviewInstallAssumptions: () => void;
  onOpenProjectSetup?: () => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const {
    projectName,
    lines,
    pricingMode,
    materialTotal,
    laborTotal,
    grandTotal,
    onReviewInstallAssumptions,
    onOpenProjectSetup,
    headerActions,
    children,
  } = props;

  const [tab, setTab] = useState<EstimateReviewTab>('lines');
  const showLabor = !isMaterialOnlyMainBid(pricingMode);

  const gated = useMemo(
    () => lines.filter((line) => deriveInstallAssumptionGateUi(line, pricingMode).isGated),
    [lines, pricingMode],
  );
  const blockingCount = gated.length;
  const assumptionQuestions = useMemo(() => {
    const qs = new Set<string>();
    for (const line of gated) {
      const g = deriveInstallAssumptionGateUi(line, pricingMode);
      g.detail.requiredQuestions.forEach((q) => qs.add(q));
    }
    return qs.size;
  }, [gated, pricingMode]);

  const notesCount = useMemo(() => {
    return lines.filter((line) => String(line.notes || '').includes('Install review')).length;
  }, [lines]);

  const laborFooter = showLabor
    ? blockingCount > 0
      ? { label: 'Labor', value: 'Blocked', warn: true }
      : { label: 'Labor', value: formatCurrencySafe(laborTotal), warn: false }
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="ui-fo-card mb-4 p-4 md:p-5">
        <FieldOpsPageHeader
          kicker="Estimate review"
          title={projectName || 'Project'}
          subtitle="Review and confirm estimate details before finalizing the proposal."
          actions={headerActions}
        />
        {blockingCount > 0 ? (
          <FieldOpsAlertBanner
            title="Labor blocked until install assumptions are confirmed."
            body="Several line items require install assumptions or blocking information before labor can be estimated."
            ctaLabel="Review install assumptions"
            onCta={onReviewInstallAssumptions}
          />
        ) : null}
        <FieldOpsTabs
          activeId={tab}
          onChange={(id) => setTab(id as EstimateReviewTab)}
          tabs={[
            { id: 'lines', label: 'Estimate Lines' },
            { id: 'assumptions', label: 'Install Assumptions', badge: assumptionQuestions },
            { id: 'blocking', label: 'Blocking Status', badge: blockingCount },
            { id: 'notes', label: 'Review Notes', badge: notesCount },
          ]}
        />
      </div>

      {tab === 'lines' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>
      ) : tab === 'assumptions' ? (
        <div className="ui-fo-card space-y-3 p-5">
          <p className="text-sm text-slate-700">
            Answer missing install fields on gated lines, or set project-level wall substrate in Setup.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
            {Array.from(
              new Set(
                gated.flatMap((line) =>
                  deriveInstallAssumptionGateUi(line, pricingMode).detail.requiredQuestions,
                ),
              ),
            ).map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-fo-btn-primary" onClick={onReviewInstallAssumptions}>
              Review install assumptions
            </button>
            {onOpenProjectSetup ? (
              <button type="button" className="ui-fo-btn-secondary" onClick={onOpenProjectSetup}>
                Open Project Setup
              </button>
            ) : null}
          </div>
        </div>
      ) : tab === 'blocking' ? (
        <div className="ui-fo-card p-5">
          {gated.length === 0 ? (
            <p className="text-sm text-slate-600">No lines are waiting on blocking or install assumptions.</p>
          ) : (
            <ul className="space-y-2">
              {gated.map((line) => {
                const g = deriveInstallAssumptionGateUi(line, pricingMode);
                return (
                  <li key={line.id} className="rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-2">
                    <p className="font-medium text-slate-900">{line.description}</p>
                    <p className="mt-0.5 text-[12px] text-orange-900">
                      {g.topMissingPrompt || g.blockedLaborHeadline}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="ui-fo-card p-5 text-sm text-slate-600">
          Internal review notes live on each line&apos;s detail panel. They are not printed on the customer proposal.
        </div>
      )}

      <FieldOpsStickyFooter
        items={[
          { label: 'Estimate total', value: `${lines.length} line items` },
          ...(laborFooter ? [laborFooter] : []),
          { label: 'Material cost', value: formatCurrencySafe(materialTotal) },
          { label: 'Other costs', value: formatCurrencySafe(0) },
          { label: 'Total estimate', value: formatCurrencySafe(grandTotal) },
        ]}
      />
    </div>
  );
}

