import React from 'react';
import type { InstallAssumptionGateUi } from '../../../shared/utils/installIntelligenceLineUi';

export function InstallAssumptionGateBadge(props: {
  label: NonNullable<InstallAssumptionGateUi['badgeLabel']>;
}) {
  const { label } = props;
  const tone =
    label === 'Needs Review'
      ? 'bg-amber-50 text-amber-950 ring-amber-200/90'
      : 'bg-sky-50 text-sky-950 ring-sky-200/90';
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${tone}`}
    >
      {label}
    </span>
  );
}

export function InstallAssumptionLaborBlockedHint(props: {
  gate: InstallAssumptionGateUi;
  compact?: boolean;
}) {
  const { gate, compact } = props;
  if (!gate.isGated) return null;
  return (
    <p className={`text-app-muted ${compact ? 'text-[10px] leading-snug' : 'text-[11px] leading-snug'}`}>
      <span className="font-medium text-amber-900">{gate.blockedLaborHeadline}</span>
      {gate.topMissingPrompt ? (
        <span className="mt-0.5 block text-amber-800/90">{gate.topMissingPrompt}</span>
      ) : null}
    </p>
  );
}

interface InstallAssumptionDetailPanelProps {
  gate: InstallAssumptionGateUi;
  projectWallSubstrate?: string | null;
  onReviewInstallAssumptions?: () => void;
  onOpenProjectSetup?: () => void;
}

function DetailBlock(props: { children: React.ReactNode }) {
  return <div className="mt-3">{props.children}</div>;
}

export function InstallAssumptionDetailPanel({
  gate,
  projectWallSubstrate,
  onReviewInstallAssumptions,
  onOpenProjectSetup,
}: InstallAssumptionDetailPanelProps) {
  if (!gate.isGated && !gate.detail.internalNotes.length && !gate.detail.customerProposalClauses.length) {
    return null;
  }

  const { detail } = gate;

  return (
    <section className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-950">
          Install assumptions
        </p>
        {gate.badgeLabel ? <InstallAssumptionGateBadge label={gate.badgeLabel} /> : null}
      </div>
      {gate.isGated ? (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-950">{gate.blockedLaborHeadline}</p>
      ) : null}

      {detail.requiredQuestions.length > 0 ? (
        <DetailBlock>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Required questions</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-amber-950">
            {detail.requiredQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </DetailBlock>
      ) : null}

      {detail.reviewFlags.length > 0 ? (
        <DetailBlock>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Review flags</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {detail.reviewFlags.map((flag) => (
              <li
                key={flag}
                className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 ring-1 ring-amber-100"
              >
                {flag}
              </li>
            ))}
          </ul>
        </DetailBlock>
      ) : null}

      {detail.internalNotes.length > 0 ? (
        <DetailBlock>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Internal notes</p>
          <ul className="mt-1 space-y-1 text-[11px] text-amber-950/90">
            {detail.internalNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </DetailBlock>
      ) : null}

      {detail.customerProposalClauses.length > 0 ? (
        <DetailBlock>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/80">
            Customer proposal clauses (internal preview)
          </p>
          <ul className="mt-1 space-y-1 text-[11px] text-emerald-950">
            {detail.customerProposalClauses.map((clause) => (
              <li key={clause}>{clause}</li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-app-muted">
            Shown on the proposal when triggered — not mixed into scope line descriptions.
          </p>
        </DetailBlock>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {onReviewInstallAssumptions ? (
          <button
            type="button"
            className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-950 shadow-sm hover:bg-amber-50"
            onClick={onReviewInstallAssumptions}
          >
            Review install assumptions
          </button>
        ) : null}
        {gate.suggestsProjectSetupForSubstrate && onOpenProjectSetup ? (
          <button
            type="button"
            className="rounded-lg border border-app-line bg-app-surface px-2.5 py-1.5 text-[11px] font-semibold text-app hover:bg-app-surface-muted"
            onClick={onOpenProjectSetup}
          >
            {projectWallSubstrate ? 'Open Project Setup' : 'Set wall substrate in Project Setup'}
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] text-app-muted">Internal only — not shown on customer proposal.</p>
    </section>
  );
}
