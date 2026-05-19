import React from 'react';
import type { ProposalPrintModel } from '../../shared/utils/proposalPrintModel';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  model: ProposalPrintModel;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="proposal-print-heading m-0 border-b border-slate-900 pb-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-900">
      {children}
    </h2>
  );
}

export function ProposalPrintDocument({ model }: Props) {
  const contactLine = [model.companyPhone, model.companyEmail].filter(Boolean).join(' · ');
  const isSummary = model.format === 'summary';
  const showLegal =
    (model.showTerms && model.terms.length > 0) ||
    (model.showExclusions && model.exclusions.length > 0) ||
    (model.showClarifications && model.clarifications.length > 0);

  return (
    <article
      data-proposal-print-document="true"
      className="proposal-document proposal-print-document print-proposal mx-auto w-full max-w-[8.5in] bg-white text-slate-900"
    >
      {/* Letterhead */}
      {model.includeCompanyHeader ? (
        <header className="proposal-print-letterhead proposal-section proposal-avoid-break px-[0.65in] pb-5 pt-[0.6in]">
          <div className="border-b-2 border-slate-900 pb-5">
            <div className="flex items-start justify-between gap-6">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                {model.companyLogoUrl ? (
                  <div className="proposal-print-logo flex h-14 w-14 shrink-0 items-center justify-center rounded border border-slate-300 bg-white p-1.5">
                    <img src={model.companyLogoUrl} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                ) : null}
                <div className="min-w-0">
                  <p className="m-0 text-[9px] font-bold uppercase tracking-[0.28em] text-slate-600">
                    Brighten Builders
                  </p>
                  <h1 className="proposal-print-company-name m-0 mt-1 text-[22px] font-bold leading-tight tracking-tight text-slate-950">
                    {model.companyName}
                  </h1>
                  <div className="mt-2 space-y-0.5 text-[11px] leading-snug text-slate-600">
                    {model.companyAddress ? <p className="m-0">{model.companyAddress}</p> : null}
                    {contactLine ? <p className="m-0">{contactLine}</p> : null}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="m-0 text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">Division 10 Proposal</p>
                <p className="proposal-print-doc-title m-0 mt-1 text-[15px] font-semibold text-slate-950">
                  {model.proposalTitle}
                </p>
                <p className="m-0 mt-2 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-800">Date</span>
                  <br />
                  {model.proposalDate}
                </p>
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header className="proposal-section proposal-avoid-break border-b border-slate-300 px-[0.65in] pb-4 pt-[0.6in]">
          <p className="m-0 text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">{model.proposalTitle}</p>
          <p className="m-0 mt-1 text-[13px] font-medium text-slate-800">{model.proposalDate}</p>
        </header>
      )}

      <div className="proposal-print-body px-[0.65in] pb-[0.65in]">
        {/* Project meta card */}
        <section className="proposal-print-meta proposal-section proposal-avoid-break mt-6">
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              <tr className="border-b border-slate-200">
                <th className="w-[28%] py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Project
                </th>
                <td className="py-2.5 font-semibold text-slate-950">{model.projectName}</td>
              </tr>
              {model.clientName ? (
                <tr className="border-b border-slate-200">
                  <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Client
                  </th>
                  <td className="py-2.5 text-slate-800">{model.clientName}</td>
                </tr>
              ) : null}
              {model.projectAddress ? (
                <tr className="border-b border-slate-200">
                  <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Address
                  </th>
                  <td className="py-2.5 leading-snug text-slate-800">{model.projectAddress}</td>
                </tr>
              ) : null}
              <tr>
                <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Proposal date
                </th>
                <td className="py-2.5 text-slate-800">{model.proposalDate}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Scope */}
        <section className="proposal-section mt-9">
          <SectionHeading>Scope of work</SectionHeading>
          <p className="proposal-print-scope-text m-0 mt-4 max-w-[42rem] text-[13px] leading-[1.7] text-slate-700">
            {model.scopeSummary}
          </p>
        </section>

        {/* Pricing summary */}
        <section className="proposal-print-pricing proposal-section proposal-avoid-break mt-9">
          <SectionHeading>Pricing summary</SectionHeading>
          <div className="proposal-print-pricing-box mt-4 border border-slate-300 bg-slate-50/80">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 text-[12px]">
              <span className="font-medium text-slate-600">Estimated duration</span>
              <span className="font-semibold tabular-nums text-slate-900">{model.durationLabel}</span>
            </div>
            <div className="px-4 py-2">
              {model.investmentRows.map((row, idx) => (
                <div
                  key={`${row.label}-${idx}`}
                  className={`flex justify-between gap-6 py-2.5 ${
                    row.isTotal
                      ? 'proposal-print-total-row -mx-4 border-t-2 border-slate-900 bg-white px-4 py-3 text-[15px] font-bold text-slate-950'
                      : row.isSectionBreak
                        ? 'border-b border-slate-200 text-[12px] font-semibold text-slate-800'
                        : 'text-[12px] text-slate-600'
                  }`}
                >
                  <span>{row.isTotal ? 'Total investment' : row.label}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrencySafe(row.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Line items / scope summary */}
        <section className="proposal-section mt-10">
          <SectionHeading>{isSummary ? 'Scope summary' : 'Line items'}</SectionHeading>
          {model.sections.length === 0 && model.scopeRollups.length === 0 ? (
            <p className="mt-4 border border-dashed border-slate-300 px-4 py-8 text-center text-[13px] text-slate-600">
              No included proposal lines to print.
            </p>
          ) : null}

          {isSummary ? (
            <div className="proposal-print-scope-cards mt-5 space-y-3">
              {model.scopeRollups.map((rollup) => (
                <div
                  key={rollup.section}
                  className="proposal-print-scope-card proposal-avoid-break flex items-center justify-between gap-4 border border-slate-200 bg-white px-4 py-3.5"
                >
                  <div>
                    <h3 className="m-0 text-[14px] font-semibold text-slate-950">{rollup.section}</h3>
                    <p className="m-0 mt-0.5 text-[11px] text-slate-500">
                      {rollup.itemCount} included item{rollup.itemCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p className="m-0 shrink-0 text-right text-[14px] font-bold tabular-nums text-slate-950">
                    {formatCurrencySafe(rollup.total)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 space-y-8">
              {model.sections.map((section) => (
                <div key={section.section} className="proposal-print-line-group">
                  <div className="proposal-print-line-group-head proposal-avoid-break flex items-end justify-between gap-4 border-b border-slate-900 pb-2">
                    <h3 className="m-0 text-[13px] font-bold uppercase tracking-wide text-slate-900">
                      {section.section}
                    </h3>
                    <p className="m-0 shrink-0 text-[12px] font-semibold tabular-nums text-slate-800">
                      {formatCurrencySafe(section.sectionTotal)}
                    </p>
                  </div>
                  {section.lines.length > 0 ? (
                    <table className="proposal-print-line-table mt-0 w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="border-b border-slate-300 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-3 text-left font-bold">Description</th>
                          {model.showLinePricing ? (
                            <th className="proposal-print-col-num py-2 pl-3 text-right font-bold">Amount</th>
                          ) : null}
                          {model.showQuantities ? (
                            <th className="proposal-print-col-num py-2 pl-3 text-right font-bold">Qty</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {section.lines.map((line) => (
                          <tr key={line.id} className="proposal-line-item border-b border-slate-100">
                            <td className="py-2.5 pr-3 align-top">
                              <p className="m-0 font-medium leading-snug text-slate-900">{line.description}</p>
                              {line.subtitle ? (
                                <p className="m-0 mt-0.5 text-[10px] leading-snug text-slate-500">{line.subtitle}</p>
                              ) : null}
                            </td>
                            {model.showLinePricing ? (
                              <td className="proposal-print-col-num py-2.5 pl-3 align-top text-right tabular-nums text-slate-800">
                                {line.extensionAmount != null ? formatCurrencySafe(line.extensionAmount) : '—'}
                              </td>
                            ) : null}
                            {model.showQuantities ? (
                              <td className="proposal-print-col-num py-2.5 pl-3 align-top text-right tabular-nums text-slate-700">
                                {line.quantity != null ? (
                                  <>
                                    {formatNumberSafe(line.quantity, 2)}
                                    {line.unit ? <span className="text-slate-500"> {line.unit}</span> : null}
                                  </>
                                ) : (
                                  '—'
                                )}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="m-0 mt-2 text-[11px] text-slate-500">
                      {section.lineCount} line item{section.lineCount === 1 ? '' : 's'} — detail available on request.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Alternates */}
        {model.alternates.length > 0 ? (
          <section className="proposal-section mt-10 border-t border-slate-200 pt-8">
            <SectionHeading>Alternates</SectionHeading>
            <p className="m-0 mt-3 text-[11px] italic text-slate-500">
              Optional scope — not included in the base investment total unless accepted in writing.
            </p>
            <table className="proposal-print-line-table proposal-print-alternates mt-4 w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-slate-300 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="py-2 text-left">Description</th>
                  {model.showQuantities ? <th className="proposal-print-col-num py-2 text-right">Qty</th> : null}
                  {model.showLinePricing ? <th className="proposal-print-col-num py-2 text-right">Amount</th> : null}
                </tr>
              </thead>
              <tbody>
                {model.alternates.map((alt) => (
                  <tr key={alt.id} className="proposal-line-item border-b border-slate-100">
                    <td className="py-2.5 align-top">
                      <p className="m-0 font-medium text-slate-900">{alt.description}</p>
                      {alt.subtitle ? <p className="m-0 mt-0.5 text-[10px] text-slate-500">{alt.subtitle}</p> : null}
                    </td>
                    {model.showQuantities ? (
                      <td className="proposal-print-col-num py-2.5 text-right tabular-nums">
                        {alt.quantity != null ? (
                          <>
                            {formatNumberSafe(alt.quantity, 2)}
                            {alt.unit ? ` ${alt.unit}` : ''}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    ) : null}
                    {model.showLinePricing ? (
                      <td className="proposal-print-col-num py-2.5 text-right font-medium tabular-nums text-slate-900">
                        {alt.extensionAmount != null ? formatCurrencySafe(alt.extensionAmount) : '—'}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {model.specialNotes ? (
          <section className="proposal-section proposal-avoid-break mt-9 border-t border-slate-200 pt-8">
            <SectionHeading>Additional notes</SectionHeading>
            <p className="m-0 mt-4 max-w-[42rem] whitespace-pre-wrap text-[13px] leading-[1.65] text-slate-700">
              {model.specialNotes}
            </p>
          </section>
        ) : null}

        {showLegal ? (
          <section className="proposal-section mt-10 border-t border-slate-200 pt-8">
            <div className="proposal-print-legal grid gap-8 sm:grid-cols-3">
              {model.showTerms && model.terms.length > 0 ? (
                <div className="proposal-legal-col proposal-avoid-break">
                  <h3 className="m-0 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Terms</h3>
                  <div className="mt-3 space-y-2 text-[11px] leading-[1.55] text-slate-700">
                    {model.terms.map((line) => (
                      <p key={line} className="m-0">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              {model.showExclusions && model.exclusions.length > 0 ? (
                <div className="proposal-legal-col proposal-avoid-break">
                  <h3 className="m-0 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Exclusions</h3>
                  <div className="mt-3 space-y-2 text-[11px] leading-[1.55] text-slate-700">
                    {model.exclusions.map((line) => (
                      <p key={line} className="m-0">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              {model.showClarifications && model.clarifications.length > 0 ? (
                <div className="proposal-legal-col proposal-avoid-break">
                  <h3 className="m-0 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Clarifications</h3>
                  <div className="mt-3 space-y-2 text-[11px] leading-[1.55] text-slate-700">
                    {model.clarifications.map((line) => (
                      <p key={line} className="m-0">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {model.includeSignatureBlock ? (
          <section className="proposal-print-signature proposal-section proposal-totals proposal-avoid-break mt-12 border-t-2 border-slate-900 pt-8">
            <SectionHeading>Acceptance</SectionHeading>
            <p className="m-0 mt-3 max-w-[36rem] text-[11px] leading-relaxed text-slate-600">
              By signing below, the client accepts the scope, pricing, and terms of this proposal.
            </p>
            <div className="proposal-print-signature-grid mt-8 grid gap-8 sm:grid-cols-3">
              <div>
                <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-slate-500">Accepted by / title</p>
                <div className="proposal-print-sig-line mt-8 border-b border-slate-900" />
                <p className="m-0 mt-2 text-[10px] text-slate-500">{model.acceptanceLabel}</p>
              </div>
              <div>
                <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-slate-500">Authorized signature</p>
                <div className="proposal-print-sig-line mt-8 border-b border-slate-900" />
                <p className="m-0 mt-2 text-[10px] text-slate-500">Signature</p>
              </div>
              <div>
                <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-slate-500">Date</p>
                <div className="proposal-print-sig-line mt-8 border-b border-slate-900" />
                <p className="m-0 mt-2 text-[10px] text-slate-500">MM / DD / YYYY</p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
