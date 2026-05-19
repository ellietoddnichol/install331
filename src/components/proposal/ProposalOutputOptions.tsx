import React, { useEffect, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { ProposalPrintDocument } from './ProposalPrintDocument';
import {
  DEFAULT_PROPOSAL_OUTPUT_OPTIONS,
  type ProposalOutputOptions as ProposalOutputOptionsState,
  type ProposalPrintModel,
} from '../../shared/utils/proposalPrintModel';

interface Props {
  open: boolean;
  model: ProposalPrintModel | null;
  options: ProposalOutputOptionsState;
  onOptionsChange: (next: ProposalOutputOptionsState) => void;
  onClose: () => void;
  onPrint: () => void | Promise<void>;
  printBusy?: boolean;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 hover:bg-slate-50/80">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function ProposalOutputOptions({
  open,
  model,
  options,
  onOptionsChange,
  onClose,
  onPrint,
  printBusy = false,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) setPreviewOpen(false);
  }, [open]);

  if (!open) return null;

  const patch = (partial: Partial<ProposalOutputOptionsState>) => onOptionsChange({ ...options, ...partial });

  return (
    <div
      className="print-hidden fixed inset-0 z-[85] flex items-stretch justify-center bg-slate-900/50 p-3 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-output-title"
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="proposal-output-title" className="text-lg font-semibold text-slate-950">
              Proposal output options
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Customer-facing print and save-as-PDF. Internal notes, flags, and hidden lines are never included.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(17rem,22rem)_1fr]">
          <div className="overflow-y-auto border-b border-slate-200 bg-slate-50/60 p-4 lg:border-b-0 lg:border-r">
            <fieldset className="space-y-3">
              <legend className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Proposal format</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['summary', 'detailed'] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => patch({ format })}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize ${
                      options.format === format
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sections</p>
              <ToggleRow
                label="Show line item pricing"
                checked={options.showLinePricing}
                onChange={(showLinePricing) => patch({ showLinePricing })}
              />
              <ToggleRow
                label="Show quantities"
                checked={options.showQuantities}
                onChange={(showQuantities) => patch({ showQuantities })}
              />
              <ToggleRow
                label="Show alternates"
                description="Optional scope lines marked as alternates on the estimate."
                checked={options.showAlternates}
                onChange={(showAlternates) => patch({ showAlternates })}
              />
              <ToggleRow
                label="Show clarifications"
                checked={options.showClarifications}
                onChange={(showClarifications) => patch({ showClarifications })}
              />
              <ToggleRow
                label="Show exclusions"
                checked={options.showExclusions}
                onChange={(showExclusions) => patch({ showExclusions })}
              />
              <ToggleRow
                label="Show terms"
                checked={options.showTerms}
                onChange={(showTerms) => patch({ showTerms })}
              />
              <ToggleRow
                label="Include signature block"
                checked={options.includeSignatureBlock}
                onChange={(includeSignatureBlock) => patch({ includeSignatureBlock })}
              />
              <ToggleRow
                label="Include company header / branding"
                checked={options.includeCompanyHeader}
                onChange={(includeCompanyHeader) => patch({ includeCompanyHeader })}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            {previewOpen && model ? (
              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/80 p-4 sm:p-6">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                <ProposalPrintDocument model={model} />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="max-w-sm text-sm text-slate-600">
                  Choose your format and sections, then preview the customer-facing proposal before printing.
                </p>
                <button
                  type="button"
                  disabled={!model}
                  onClick={() => setPreviewOpen(true)}
                  className="ui-fo-btn-secondary h-10 px-5 disabled:opacity-50"
                >
                  Preview proposal
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
          {previewOpen ? (
            <button
              type="button"
              className="ui-fo-btn-secondary mr-auto h-10 px-4"
              onClick={() => setPreviewOpen(false)}
            >
              Back to options
            </button>
          ) : (
            <button
              type="button"
              disabled={!model}
              className="ui-fo-btn-secondary mr-auto h-10 px-4 disabled:opacity-50"
              onClick={() => setPreviewOpen(true)}
            >
              Preview proposal
            </button>
          )}
          <button type="button" onClick={onClose} className="ui-fo-btn-secondary h-10 px-4">
            Close
          </button>
          <button
            type="button"
            disabled={!model || printBusy}
            onClick={() => void onPrint()}
            className="ui-fo-btn-primary inline-flex h-10 items-center gap-2 px-5 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {printBusy ? 'Preparing…' : 'Print / Save PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_PROPOSAL_OUTPUT_OPTIONS };
