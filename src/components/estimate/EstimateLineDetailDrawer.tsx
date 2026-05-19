import React, { useEffect, useMemo, useState } from 'react';
import type { ProposalVisibility, TakeoffLineRecord } from '../../shared/types/estimator';
import type { EstimateLineDetailModel } from '../../shared/utils/estimateLineDetailModel';
import {
  lineOverrideRows,
  projectAssumptionRows,
} from '../../shared/utils/estimateLineDetailModel';
import { stripInstallIntelligenceMarkersFromNotes } from '../../shared/utils/lineInstallAssumptions';
import { WorkflowRightDrawer } from '../workflow/WorkflowRightDrawer';
import { formatCurrencySafe, formatLaborDurationMinutes, formatNumberSafe } from '../../utils/numberFormat';

interface EstimateLineDetailDrawerProps {
  open: boolean;
  model: EstimateLineDetailModel | null;
  line: TakeoffLineRecord | null;
  showMaterial: boolean;
  showLabor: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (lineId: string, updates: Partial<TakeoffLineRecord>) => Promise<void>;
  onSaveAndRecalculateLabor: (lineId: string) => Promise<void>;
  onEditInstallAssumptions: (lineId: string) => void;
  onGoToQuote?: (quoteId: string) => void;
  onDuplicateLine?: (lineId: string) => void;
  onRequestHideFromProposal?: (lineId: string) => void;
}

function Section(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{props.title}</h3>
      {props.subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{props.subtitle}</p> : null}
      <div className="mt-2">{props.children}</div>
    </section>
  );
}

function ReadRow(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[12px]">
      <span className="text-slate-500">{props.label}</span>
      <span className="max-w-[65%] text-right font-medium text-slate-900">{props.value}</span>
    </div>
  );
}

function statusTone(status: EstimateLineDetailModel['header']['laborStatus']): string {
  switch (status) {
    case 'labor_ready':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'labor_paused':
    case 'needs_review':
      return 'border-amber-200 bg-amber-50 text-amber-950';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

export function EstimateLineDetailDrawer({
  open,
  model,
  line,
  showMaterial,
  showLabor,
  busy = false,
  onClose,
  onSave,
  onSaveAndRecalculateLabor,
  onEditInstallAssumptions,
  onGoToQuote,
  onDuplicateLine,
  onRequestHideFromProposal,
}: EstimateLineDetailDrawerProps) {
  const [materialCost, setMaterialCost] = useState('');
  const [laborMinutes, setLaborMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [taxable, setTaxable] = useState(true);
  const [visibility, setVisibility] = useState<ProposalVisibility>('customer_visible');

  const baselineNotes = useMemo(
    () => (line ? stripInstallIntelligenceMarkersFromNotes(line.notes) || '' : ''),
    [line?.notes, line?.id],
  );

  useEffect(() => {
    if (!open || !line || !model) return;
    setMaterialCost(String(line.materialCost ?? ''));
    setLaborMinutes(String(line.laborMinutes ?? ''));
    setNotes(baselineNotes);
    setTaxable(line.taxable !== false);
    setVisibility(line.proposalVisibility || 'customer_visible');
  }, [open, line?.id, line?.updatedAt, model?.lineId, baselineNotes]);

  const dirty = useMemo(() => {
    if (!line) return false;
    return (
      Number(materialCost) !== Number(line.materialCost)
      || Number(laborMinutes) !== Number(line.laborMinutes)
      || notes !== baselineNotes
      || taxable !== (line.taxable !== false)
      || visibility !== (line.proposalVisibility || 'customer_visible')
    );
  }, [line, materialCost, laborMinutes, notes, baselineNotes, taxable, visibility]);

  function handleClose() {
    if (dirty && !window.confirm('Discard unsaved changes to this line?')) return;
    onClose();
  }

  if (!open || !model || !line) return null;

  async function handleSave() {
    const updates: Partial<TakeoffLineRecord> = {
      materialCost: Number(materialCost) || 0,
      laborMinutes: Number(laborMinutes) || 0,
      taxable,
      proposalVisibility: visibility,
    };
    if (notes !== baselineNotes) {
      updates.notes = notes.trim() || null;
    }
    await onSave(line!.id, updates);
  }

  const projectRows = projectAssumptionRows(model.assumptions);
  const overrideRows = lineOverrideRows(model.assumptions.lineOverrides);

  return (
    <WorkflowRightDrawer
      open={open}
      title="Estimate line detail"
      subtitle="Full story for this scope row — source, pricing, labor, and proposal."
      widthClassName="max-w-[min(100vw-1rem,32rem)]"
      onClose={handleClose}
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-fo-btn-primary h-10 flex-1 px-3" disabled={busy || !dirty} onClick={() => void handleSave()}>
            Save
          </button>
          <button
            type="button"
            className="ui-btn-secondary h-10 px-3 text-[12px] font-semibold"
            disabled={busy}
            onClick={() => void (async () => {
              if (dirty) await handleSave();
              await onSaveAndRecalculateLabor(line.id);
            })()}
          >
            Save and recalculate
          </button>
          <button type="button" className="ui-btn-secondary h-10 px-3 text-[12px] font-semibold" disabled={busy} onClick={handleClose}>
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4">
        <Section title="Line overview">
          <p className="text-[14px] font-semibold text-slate-900">{model.header.description}</p>
          <p className="mt-1 text-[12px] text-slate-600">
            {formatNumberSafe(model.header.qty, 2)} {model.header.unit}
            {model.header.category ? ` · ${model.header.category}` : ''}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{model.header.sourceTypeLabel}</p>
          <span
            className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(model.header.laborStatus)}`}
          >
            {model.header.laborStatusLabel}
          </span>
          {model.header.laborPauseReason ? (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-950">{model.header.laborPauseReason}</p>
          ) : null}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {showMaterial ? (
              <div className="rounded-md bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
                <p className="text-[9px] font-semibold uppercase text-slate-500">Material</p>
                <p className="text-[12px] font-semibold tabular-nums">{formatCurrencySafe(model.header.materialTotal)}</p>
              </div>
            ) : null}
            {showLabor ? (
              <div className="rounded-md bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
                <p className="text-[9px] font-semibold uppercase text-slate-500">Labor</p>
                <p className="text-[12px] font-semibold tabular-nums">{formatCurrencySafe(model.header.laborTotal)}</p>
              </div>
            ) : null}
            <div className="rounded-md bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
              <p className="text-[9px] font-semibold uppercase text-slate-500">Line total</p>
              <p className="text-[12px] font-semibold tabular-nums">{formatCurrencySafe(model.header.lineTotal)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onDuplicateLine ? (
              <button type="button" className="ui-btn-secondary h-8 px-2.5 text-[11px] font-semibold" onClick={() => onDuplicateLine(line.id)}>
                Duplicate line
              </button>
            ) : null}
            {onRequestHideFromProposal && visibility !== 'internal_only' ? (
              <button
                type="button"
                className="ui-btn-secondary h-8 px-2.5 text-[11px] font-semibold"
                onClick={() => onRequestHideFromProposal(line.id)}
              >
                Hide from proposal
              </button>
            ) : null}
          </div>
        </Section>

        <Section
          title="Source quote row"
          subtitle={
            model.sourceQuote.linked
              ? 'Original vendor quote context for this estimate line.'
              : undefined
          }
        >
          {model.sourceQuote.linked ? (
            <div className="space-y-1.5">
              <ReadRow label="Vendor quote" value={model.sourceQuote.vendorLabel || '—'} />
              <ReadRow label="Description" value={model.sourceQuote.description || '—'} />
              <ReadRow
                label="Qty / unit"
                value={
                  model.sourceQuote.qty != null
                    ? `${model.sourceQuote.qty} ${model.sourceQuote.unit || ''}`
                    : '—'
                }
              />
              {model.sourceQuote.materialAmount != null ? (
                <ReadRow label="Material" value={formatCurrencySafe(model.sourceQuote.materialAmount)} />
              ) : null}
              {model.sourceQuote.rowTypeLabel ? (
                <ReadRow label="Row type" value={model.sourceQuote.rowTypeLabel} />
              ) : null}
              {model.sourceQuote.notes ? (
                <p className="mt-1 text-[11px] text-slate-600">
                  {stripInstallIntelligenceMarkersFromNotes(model.sourceQuote.notes)}
                </p>
              ) : null}
              {model.sourceQuote.quoteId && onGoToQuote ? (
                <button
                  type="button"
                  className="mt-2 text-[11px] font-semibold text-sky-800 underline decoration-sky-300 underline-offset-2"
                  onClick={() => onGoToQuote(model.sourceQuote.quoteId!)}
                >
                  View source quote
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-slate-600">
              This line was created manually or does not have a linked quote row.
            </p>
          )}
        </Section>

        <Section title="Catalog match">
          {model.catalog.matched && (model.catalog.description || model.catalog.sku) ? (
            <div className="space-y-1.5">
              <ReadRow label="Item" value={model.catalog.description || '—'} />
              {model.catalog.sku ? <ReadRow label="SKU" value={model.catalog.sku} /> : null}
              {model.catalog.manufacturer ? <ReadRow label="Manufacturer" value={model.catalog.manufacturer} /> : null}
              {model.catalog.category ? <ReadRow label="Category" value={model.catalog.category} /> : null}
              {model.catalog.matchConfidence ? (
                <ReadRow label="Match" value={model.catalog.matchConfidence} />
              ) : null}
              {model.catalog.installLaborFamily ? (
                <ReadRow label="Install family" value={model.catalog.installLaborFamily} />
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-slate-600">No catalog item matched yet. Material and labor can still be edited below.</p>
          )}
        </Section>

        {showMaterial ? (
          <Section title="Material pricing">
            <label className="block space-y-1 text-[12px]">
              <span className="font-medium text-slate-700">Material unit cost</span>
              <input className="ui-input w-full tabular-nums" value={materialCost} onChange={(e) => setMaterialCost(e.target.value)} />
            </label>
            <ReadRow label="Material total" value={formatCurrencySafe(model.material.total)} />
            <ReadRow label="Pricing source" value={model.material.pricingSource} />
            <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-700">
              <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
              Taxable line
            </label>
          </Section>
        ) : null}

        {showLabor ? (
          <Section title="Labor">
            <ReadRow label="Status" value={model.labor.statusLabel} />
            <ReadRow label="Labor basis" value={model.labor.basisLabel} />
            {model.labor.origin ? <ReadRow label="Source" value={model.labor.origin} /> : null}
            {model.labor.paused && model.labor.pauseMessage ? (
              <p className="rounded-md border border-amber-200/80 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-950">
                Labor is paused until assumptions are confirmed.
                <span className="mt-1 block">{model.labor.pauseMessage}</span>
              </p>
            ) : null}
            <label className="mt-2 block space-y-1 text-[12px]">
              <span className="font-medium text-slate-700">Labor minutes (per unit)</span>
              <input className="ui-input w-full tabular-nums" value={laborMinutes} onChange={(e) => setLaborMinutes(e.target.value)} />
            </label>
            <ReadRow label="Extended time" value={formatLaborDurationMinutes(model.labor.extendedMinutes)} />
            <ReadRow label="Labor rate" value={`${formatCurrencySafe(model.labor.ratePerHour)}/hr`} />
            <ReadRow label="Labor unit cost" value={formatCurrencySafe(model.labor.unitCost)} />
            <ReadRow label="Labor total" value={formatCurrencySafe(model.labor.extendedCost)} />
            {model.labor.generatedMinutes != null ? (
              <ReadRow label="Generated baseline" value={formatLaborDurationMinutes(model.labor.generatedMinutes)} />
            ) : null}
            <button
              type="button"
              className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-50"
              onClick={() => onEditInstallAssumptions(line.id)}
            >
              Review install assumptions
            </button>
          </Section>
        ) : null}

        <Section
          title="Install assumptions"
          subtitle="Line-level values override project defaults from Setup."
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Project defaults</p>
          <ul className="mt-1 space-y-1">
            {projectRows.map((row) => (
              <ReadRow key={row.label} label={row.label} value={row.value} />
            ))}
          </ul>
          {overrideRows.length > 0 ? (
            <>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Line overrides</p>
              <ul className="mt-1 space-y-1">
                {overrideRows.map((row) => (
                  <ReadRow key={row.label} label={row.label} value={row.value} />
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">No line-specific overrides — project defaults apply.</p>
          )}
          <button
            type="button"
            className="mt-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
            onClick={() => onEditInstallAssumptions(line.id)}
          >
            Edit assumptions
          </button>
        </Section>

        <Section title="Modifiers / adders" subtitle="Read-only summary from applied line modifiers.">
          {model.modifiers.names.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-[12px] text-slate-700">
              {model.modifiers.names.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-600">No modifiers applied.</p>
          )}
          {model.modifiers.rollupSummary ? (
            <p className="mt-2 text-[11px] text-slate-500">{model.modifiers.rollupSummary}</p>
          ) : null}
        </Section>

        <Section title="Proposal visibility">
          <label className="block space-y-1 text-[12px]">
            <span className="font-medium text-slate-700">Proposal presentation</span>
            <select
              className="ui-input w-full"
              value={visibility}
              onChange={(e) => {
                const next = e.target.value as ProposalVisibility;
                if (next === 'internal_only' && visibility !== 'internal_only' && onRequestHideFromProposal) {
                  onRequestHideFromProposal(line.id);
                  return;
                }
                setVisibility(next);
              }}
            >
              <option value="customer_visible">Included in proposal</option>
              <option value="internal_only">Hidden from proposal</option>
              <option value="optional_or_alt">Allowance / alternate</option>
            </select>
          </label>
          {model.proposal.descriptionOverride ? (
            <ReadRow label="Customer description override" value={model.proposal.descriptionOverride} />
          ) : null}
          {model.proposal.customerClauses.length > 0 ? (
            <div className="mt-2">
              <p className="text-[10px] font-semibold uppercase text-emerald-800">Customer-facing proposal notes</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-emerald-950">
                {model.proposal.customerClauses.map((clause) => (
                  <li key={clause}>{clause}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-2 text-[10px] text-slate-500">
            Internal estimating notes stay in the estimate — they are not printed on the customer proposal.
          </p>
        </Section>

        <Section title="Notes">
          <label className="block space-y-1 text-[12px]">
            <span className="font-medium text-slate-700">Internal estimate notes</span>
            <textarea className="ui-input min-h-[88px] w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {model.notes.requiredQuestions.length > 0 ? (
            <div className="mt-2 rounded-md border border-amber-100 bg-amber-50/50 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase text-amber-900">Open install questions</p>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-950">
                {model.notes.requiredQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      </div>
    </WorkflowRightDrawer>
  );
}
