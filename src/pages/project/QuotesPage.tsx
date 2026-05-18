import React, { useMemo, useState } from 'react';
import type { ProjectFileRecord, SourceQuoteLineRecord, SourceQuoteRecord } from '../../shared/types/estimator';
import { FieldOpsKpiCard } from '../../components/fieldops/FieldOpsPrimitives';
import { formatCurrencySafe } from '../../utils/numberFormat';
import { parseQuotePasteText } from '../../shared/utils/quoteStagingParser';

interface QuoteCreateDraft {
  vendorName: string;
  quoteNumber: string;
  quoteDate: string;
  notes: string;
  file: File | null;
}

interface QuoteLineDraft {
  rawDescription: string;
  manufacturer: string;
  skuModel: string;
  qty: number;
  unit: string;
  unitCost?: number | null;
  totalCost?: number | null;
  materialCost: number;
  notes: string;
  rowType?: SourceQuoteLineRecord['rowType'];
}

interface QuotesPageProps {
  quotes: SourceQuoteRecord[];
  activeQuoteId: string;
  setActiveQuoteId: (quoteId: string) => void;
  quoteLines: SourceQuoteLineRecord[];
  /** Estimate lines linked by `sourceRef` → quote line id (vendor_quote imports). */
  importedQuoteLineIds?: ReadonlySet<string>;
  projectFiles: ProjectFileRecord[];
  fileUploading: boolean;
  onCreateQuote: (draft: QuoteCreateDraft) => Promise<void>;
  onUpdateQuote: (quoteId: string, updates: Partial<SourceQuoteRecord>) => Promise<void>;
  onDeleteQuote: (quoteId: string) => Promise<void>;
  onAddQuoteLine: (quoteId: string, draft: QuoteLineDraft) => Promise<void>;
  onAddQuoteLinesBulk: (quoteId: string, drafts: QuoteLineDraft[]) => Promise<void>;
  onUpdateQuoteLine: (quoteId: string, lineId: string, updates: Partial<SourceQuoteLineRecord>) => Promise<void>;
  onDeleteQuoteLine: (quoteId: string, lineId: string) => Promise<void>;
  onImportSelected: (quoteId: string) => Promise<void>;
  onExtractSourceFile: (quoteId: string, replaceExisting: boolean) => Promise<void>;
  onPromoteToCatalogCandidates: (quoteId: string, selectedLineIds: string[], includeNonCatalogTypes?: boolean) => Promise<{ promotedCount: number; skippedCount: number }>;
}

const DEFAULT_QUOTE_CREATE_DRAFT: QuoteCreateDraft = {
  vendorName: '',
  quoteNumber: '',
  quoteDate: '',
  notes: '',
  file: null,
};

const DEFAULT_QUOTE_LINE_DRAFT: QuoteLineDraft = {
  rawDescription: '',
  manufacturer: '',
  skuModel: '',
  qty: 1,
  unit: 'EA',
  unitCost: null,
  totalCost: null,
  materialCost: 0,
  notes: '',
  rowType: 'material',
};

const BILLABLE_ROW_TYPES = new Set<SourceQuoteLineRecord['rowType']>(['material', 'accessory', 'installation', 'service']);

function quoteWorkflowLabel(status: SourceQuoteRecord['importStatus']): string {
  if (status === 'manual_review') return 'Needs review';
  if (status === 'ready_to_import') return 'Ready to import';
  if (status === 'partially_imported') return 'Partially imported';
  if (status === 'imported') return 'Imported';
  return 'In progress';
}

function workflowTone(status: SourceQuoteRecord['importStatus']): string {
  if (status === 'imported') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'ready_to_import') return 'border-sky-200 bg-sky-50 text-sky-900';
  if (status === 'partially_imported') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-slate-200 bg-white text-slate-700';
}

function rowTypeOptionLabel(t: SourceQuoteLineRecord['rowType']): string {
  switch (t) {
    case 'material':
      return 'Material';
    case 'accessory':
      return 'Accessory';
    case 'freight':
      return 'Freight / fee';
    case 'installation':
      return 'Installation';
    case 'service':
      return 'Service';
    case 'note':
      return 'Note / terms';
    case 'ignore':
      return 'Excluded';
    default:
      return String(t);
  }
}

function sortBySortOrder(lines: SourceQuoteLineRecord[]): SourceQuoteLineRecord[] {
  return [...lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function partitionQuoteLines(lines: SourceQuoteLineRecord[], importedIds: ReadonlySet<string>) {
  const imported = lines.filter((l) => importedIds.has(l.id));
  const notImported = lines.filter((l) => !importedIds.has(l.id));
  const excluded = notImported.filter((l) => l.rowType === 'ignore');
  const terms = notImported.filter((l) => l.rowType === 'note' || l.rowType === 'freight');
  const claimed = new Set<string>([...imported, ...excluded, ...terms].map((l) => l.id));
  const rest = notImported.filter((l) => !claimed.has(l.id));
  const needsReview = sortBySortOrder(rest.filter((l) => BILLABLE_ROW_TYPES.has(l.rowType) && !l.importSelected));
  const readyToImport = sortBySortOrder(rest.filter((l) => BILLABLE_ROW_TYPES.has(l.rowType) && l.importSelected));
  const other = sortBySortOrder(rest.filter((l) => !BILLABLE_ROW_TYPES.has(l.rowType)));
  return {
    imported: sortBySortOrder(imported),
    excluded: sortBySortOrder(excluded),
    terms: sortBySortOrder(terms),
    needsReview,
    readyToImport,
    other,
  };
}

export function QuotesPage({
  quotes,
  activeQuoteId,
  setActiveQuoteId,
  quoteLines,
  importedQuoteLineIds = new Set<string>(),
  projectFiles,
  fileUploading,
  onCreateQuote,
  onUpdateQuote,
  onDeleteQuote,
  onAddQuoteLine,
  onAddQuoteLinesBulk,
  onUpdateQuoteLine,
  onDeleteQuoteLine,
  onImportSelected,
  onExtractSourceFile,
  onPromoteToCatalogCandidates,
}: QuotesPageProps) {
  const [quoteDraft, setQuoteDraft] = useState<QuoteCreateDraft>(DEFAULT_QUOTE_CREATE_DRAFT);
  const [lineDraft, setLineDraft] = useState<QuoteLineDraft>(DEFAULT_QUOTE_LINE_DRAFT);
  const [bulkPaste, setBulkPaste] = useState('');
  const [bulkPreviewCount, setBulkPreviewCount] = useState(0);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const activeQuote = quotes.find((quote) => quote.id === activeQuoteId) || null;
  const projectFilesById = useMemo(() => {
    const map = new Map<string, ProjectFileRecord>();
    projectFiles.forEach((file) => map.set(file.id, file));
    return map;
  }, [projectFiles]);
  const selectedCount = quoteLines.filter((line) => line.importSelected).length;

  const buckets = useMemo(() => partitionQuoteLines(quoteLines, importedQuoteLineIds), [quoteLines, importedQuoteLineIds]);

  const cockpitKpis = useMemo(() => {
    const vendorNames = new Set(quotes.map((q) => q.vendorName.trim()).filter(Boolean));
    const readyLines = buckets.readyToImport;
    const estAmount = readyLines.reduce((sum, line) => sum + (line.materialCost || 0), 0);
    return {
      vendors: vendorNames.size,
      quotes: quotes.length,
      totalLines: quoteLines.length,
      readyToImport: readyLines.length,
      estAmount,
    };
  }, [quotes, quoteLines.length, buckets.readyToImport]);

  async function handleCreateQuote() {
    if (!quoteDraft.vendorName.trim()) return;
    await onCreateQuote(quoteDraft);
    setQuoteDraft(DEFAULT_QUOTE_CREATE_DRAFT);
  }

  async function handleAddLine() {
    if (!activeQuoteId || !lineDraft.rawDescription.trim()) return;
    await onAddQuoteLine(activeQuoteId, lineDraft);
    setLineDraft(DEFAULT_QUOTE_LINE_DRAFT);
  }

  function toggleRowSelected(lineId: string, selected: boolean) {
    setSelectedRowIds((prev) => {
      if (selected) return prev.includes(lineId) ? prev : [...prev, lineId];
      return prev.filter((id) => id !== lineId);
    });
  }

  async function handleDuplicateLine(line: SourceQuoteLineRecord) {
    if (!activeQuoteId) return;
    await onAddQuoteLine(activeQuoteId, {
      rawDescription: `${line.rawDescription} (copy)`,
      manufacturer: line.manufacturer || '',
      skuModel: line.skuModel || '',
      qty: line.qty,
      unit: line.unit,
      unitCost: line.unitCost,
      totalCost: line.totalCost,
      materialCost: line.materialCost,
      notes: line.notes || '',
      rowType: line.rowType,
    });
  }

  async function handleBulkDuplicate() {
    if (!activeQuoteId || selectedRowIds.length === 0) return;
    const selected = quoteLines.filter((line) => selectedRowIds.includes(line.id));
    if (selected.length === 0) return;
    await onAddQuoteLinesBulk(
      activeQuoteId,
      selected.map((line) => ({
        rawDescription: `${line.rawDescription} (copy)`,
        manufacturer: line.manufacturer || '',
        skuModel: line.skuModel || '',
        qty: line.qty,
        unit: line.unit,
        unitCost: line.unitCost,
        totalCost: line.totalCost,
        materialCost: line.materialCost,
        notes: line.notes || '',
        rowType: line.rowType,
      }))
    );
    setSelectedRowIds([]);
  }

  async function handleBulkDelete() {
    if (!activeQuoteId || selectedRowIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedRowIds.length} selected quote line${selectedRowIds.length === 1 ? '' : 's'}?`)) return;
    await Promise.all(selectedRowIds.map((lineId) => onDeleteQuoteLine(activeQuoteId, lineId)));
    setSelectedRowIds([]);
  }

  async function handlePromoteSelected(includeNonCatalogTypes = false) {
    if (!activeQuoteId || selectedRowIds.length === 0) return;
    await onPromoteToCatalogCandidates(activeQuoteId, selectedRowIds, includeNonCatalogTypes);
    setSelectedRowIds([]);
  }

  async function handleBulkImportText() {
    if (!activeQuoteId) return;
    const rows = parseQuotePasteText(bulkPaste).map((row) => ({
      rawDescription: row.rawDescription,
      manufacturer: row.manufacturer || '',
      skuModel: row.skuModel || '',
      qty: row.qty || 1,
      unit: row.unit || 'EA',
      materialCost: row.materialCost || row.unitCost || 0,
      notes: row.notes || '',
      rowType: row.rowType,
      unitCost: row.unitCost,
      totalCost: row.totalCost,
    }));
    if (rows.length === 0) return;
    await onAddQuoteLinesBulk(activeQuoteId, rows);
    setBulkPaste('');
    setBulkPreviewCount(0);
  }

  async function handleBulkImportFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const rows = parseQuotePasteText(text).map((row) => ({
      rawDescription: row.rawDescription,
      manufacturer: row.manufacturer || '',
      skuModel: row.skuModel || '',
      qty: row.qty || 1,
      unit: row.unit || 'EA',
      materialCost: row.materialCost || row.unitCost || 0,
      notes: row.notes || '',
      rowType: row.rowType,
      unitCost: row.unitCost,
      totalCost: row.totalCost,
    }));
    if (!activeQuoteId || rows.length === 0) {
      setBulkPreviewCount(rows.length);
      return;
    }
    await onAddQuoteLinesBulk(activeQuoteId, rows);
    setBulkPreviewCount(0);
  }

  function renderRow(line: SourceQuoteLineRecord, opts: { mode: 'default' | 'imported' | 'excluded' | 'terms' }) {
    if (!activeQuote) return null;
    const importedRow = importedQuoteLineIds.has(line.id);
    const hideIncludeToggle = opts.mode === 'imported' || opts.mode === 'excluded' || opts.mode === 'terms';

    return (
      <tr key={line.id} className="border-b border-slate-100 align-top">
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={selectedRowIds.includes(line.id)}
            onChange={(event) => toggleRowSelected(line.id, event.target.checked)}
            aria-label="Select row for bulk actions"
          />
        </td>
        <td className="px-3 py-2">
          {!hideIncludeToggle ? (
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-700">
              <input type="checkbox" checked={line.importSelected} onChange={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { importSelected: event.target.checked })} />
              <span>Include</span>
            </label>
          ) : importedRow ? (
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">On estimate</span>
          ) : opts.mode === 'excluded' ? (
            <span className="text-[11px] text-slate-400">—</span>
          ) : (
            <span className="text-[11px] text-slate-400">—</span>
          )}
        </td>
        <td className="min-w-[9rem] px-3 py-2">
          <select
            className="ui-input text-[13px]"
            defaultValue={line.rowType}
            onChange={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { rowType: event.target.value as SourceQuoteLineRecord['rowType'] })}
          >
            {(['material', 'accessory', 'freight', 'installation', 'service', 'note', 'ignore'] as const).map((t) => (
              <option key={t} value={t}>
                {rowTypeOptionLabel(t)}
              </option>
            ))}
          </select>
        </td>
        <td className="min-w-[18rem] px-3 py-2">
          <textarea className="ui-input min-h-[4.5rem] text-[13px]" defaultValue={line.rawDescription} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { rawDescription: event.target.value, normalizedDescription: event.target.value })} />
          <textarea className="ui-input mt-1.5 min-h-12 text-[12px]" placeholder="Line notes" defaultValue={line.notes || ''} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { notes: event.target.value || null })} />
        </td>
        <td className="min-w-[10rem] px-3 py-2">
          <input className="ui-input text-[13px]" defaultValue={line.skuModel || ''} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { skuModel: event.target.value || null })} />
          <input className="ui-input mt-1.5 text-[12px]" placeholder="Manufacturer" defaultValue={line.manufacturer || ''} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { manufacturer: event.target.value || null })} />
        </td>
        <td className="min-w-[5rem] px-3 py-2">
          <input className="ui-input text-right text-[13px]" type="number" min="0" step="0.01" defaultValue={line.qty} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { qty: Number(event.target.value || 0) || 1 })} />
        </td>
        <td className="min-w-[4rem] px-3 py-2">
          <input className="ui-input text-[13px]" defaultValue={line.unit} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { unit: event.target.value || 'EA' })} />
        </td>
        <td className="min-w-[7rem] px-3 py-2">
          <input className="ui-input text-right text-[13px]" type="number" min="0" step="0.01" defaultValue={line.materialCost} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { materialCost: Number(event.target.value || 0) })} />
          <p className="mt-1 text-right text-[11px] text-slate-500">{formatCurrencySafe(line.materialCost)}</p>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col items-stretch gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Actions</span>
            {!importedRow && opts.mode !== 'excluded' && opts.mode !== 'terms' ? (
              <span className="text-[11px] text-slate-500">Edit fields inline</span>
            ) : null}
            {!importedRow && line.rowType !== 'ignore' ? (
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void onUpdateQuoteLine(activeQuote.id, line.id, { rowType: 'ignore' })}
              >
                Exclude
              </button>
            ) : null}
            {opts.mode === 'excluded' ? (
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void onUpdateQuoteLine(activeQuote.id, line.id, { rowType: 'material', importSelected: false })}
              >
                Restore as material
              </button>
            ) : null}
            <button type="button" onClick={() => void handleDuplicateLine(line)} className="text-[11px] font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline">
              Duplicate row
            </button>
            <button type="button" onClick={() => void onDeleteQuoteLine(activeQuote.id, line.id)} className="text-[11px] font-semibold text-red-700 underline-offset-2 hover:underline">
              Delete
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function renderSection(title: string, subtitle: string, rows: SourceQuoteLineRecord[], opts: { mode: 'default' | 'imported' | 'excluded' | 'terms'; empty: string }) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
            <span className="tabular-nums text-[12px] font-medium text-slate-500">{rows.length}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-slate-600">{subtitle}</p>
        </div>
        {rows.length === 0 ? (
          <p className="mt-4 text-[13px] leading-relaxed text-slate-500">{opts.empty}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[56rem] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-2"> </th>
                  <th className="px-3 py-2">Include</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">SKU / Model</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2 text-right">Vendor $</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>{rows.map((line) => renderRow(line, { mode: opts.mode }))}</tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(17rem,20rem)_1fr]">
      <aside className="space-y-4">
        <section className="ui-fo-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Upload or paste quote</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Add a vendor quote</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">Attach a file or drop rows on the right — then review, include lines, and send them to the estimate.</p>
          <div className="mt-4 space-y-3 text-sm">
            <label className="space-y-1.5">
              <span className="font-medium text-slate-700">Vendor</span>
              <input className="ui-input" value={quoteDraft.vendorName} onChange={(event) => setQuoteDraft((prev) => ({ ...prev, vendorName: event.target.value }))} placeholder="Vendor name" />
            </label>
            <label className="space-y-1.5">
              <span className="font-medium text-slate-700">Quote number</span>
              <input className="ui-input" value={quoteDraft.quoteNumber} onChange={(event) => setQuoteDraft((prev) => ({ ...prev, quoteNumber: event.target.value }))} placeholder="Optional" />
            </label>
            <label className="space-y-1.5">
              <span className="font-medium text-slate-700">Quote date</span>
              <input className="ui-input" type="date" value={quoteDraft.quoteDate} onChange={(event) => setQuoteDraft((prev) => ({ ...prev, quoteDate: event.target.value }))} />
            </label>
            <label className="space-y-1.5">
              <span className="font-medium text-slate-700">Quote file</span>
              <input type="file" className="ui-input file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold" onChange={(event) => setQuoteDraft((prev) => ({ ...prev, file: event.target.files?.[0] || null }))} />
            </label>
            <label className="space-y-1.5">
              <span className="font-medium text-slate-700">Notes</span>
              <textarea className="ui-input min-h-24" value={quoteDraft.notes} onChange={(event) => setQuoteDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Optional scope notes for your team" />
            </label>
            <button type="button" onClick={() => void handleCreateQuote()} className="ui-fo-btn-primary w-full disabled:opacity-60" disabled={!quoteDraft.vendorName.trim() || fileUploading}>
              {fileUploading ? 'Uploading…' : 'Create quote'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quotes on this project</p>
              <p className="mt-0.5 text-[13px] text-slate-600">{quotes.length === 0 ? 'None yet — create one above.' : 'Select a quote to review rows.'}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700">{quotes.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {quotes.map((quote) => {
              const fileLabel = quote.sourceFileId ? projectFilesById.get(quote.sourceFileId)?.fileName || 'File attached' : 'No file';
              const active = quote.id === activeQuoteId;
              return (
                <button
                  key={quote.id}
                  type="button"
                  onClick={() => setActiveQuoteId(quote.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    active ? 'border-orange-400 bg-orange-50/90 shadow-sm ring-1 ring-orange-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-slate-900">{quote.vendorName}</p>
                      <p className="mt-0.5 truncate text-[12px] text-slate-600">{quote.quoteNumber?.trim() || 'No quote #'} · {quote.quoteDate || 'No date'}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-500">{fileLabel}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${workflowTone(quote.importStatus)}`}>{quoteWorkflowLabel(quote.importStatus)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <section className="min-w-0 space-y-5">
        {activeQuote ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <FieldOpsKpiCard label="Vendors" value={String(cockpitKpis.vendors)} />
              <FieldOpsKpiCard label="Quotes" value={String(cockpitKpis.quotes)} />
              <FieldOpsKpiCard label="Total lines" value={String(cockpitKpis.totalLines)} />
              <FieldOpsKpiCard label="Ready to import" value={String(cockpitKpis.readyToImport)} emphasize={cockpitKpis.readyToImport > 0} />
              <FieldOpsKpiCard label="Est. amount" value={formatCurrencySafe(cockpitKpis.estAmount)} hint="Included material rows" />
            </div>

            <div className="ui-fo-card p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <input
                    className="w-full border-0 bg-transparent p-0 text-[22px] font-semibold tracking-tight text-slate-950 placeholder:text-slate-400 focus:outline-none"
                    defaultValue={activeQuote.vendorName}
                    aria-label="Vendor name"
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value && value !== activeQuote.vendorName) void onUpdateQuote(activeQuote.id, { vendorName: value });
                    }}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-1 text-[13px]">
                      <span className="font-medium text-slate-700">Quote number</span>
                      <input className="ui-input" defaultValue={activeQuote.quoteNumber || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { quoteNumber: event.target.value || null })} />
                    </label>
                    <label className="space-y-1 text-[13px]">
                      <span className="font-medium text-slate-700">Quote date</span>
                      <input className="ui-input" type="date" defaultValue={activeQuote.quoteDate || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { quoteDate: event.target.value || null })} />
                    </label>
                    <label className="space-y-1 text-[13px]">
                      <span className="font-medium text-slate-700">Delivery date</span>
                      <input className="ui-input" type="date" defaultValue={activeQuote.deliveryDate || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { deliveryDate: event.target.value || null })} />
                    </label>
                    <label className="space-y-1 text-[13px]">
                      <span className="font-medium text-slate-700">Quote status</span>
                      <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] font-medium text-slate-800">{quoteWorkflowLabel(activeQuote.importStatus)}</div>
                    </label>
                  </div>
                  <label className="block space-y-1 text-[13px]">
                    <span className="font-medium text-slate-700">Ship-to / job reference</span>
                    <input className="ui-input" defaultValue={activeQuote.shipTo || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { shipTo: event.target.value || null })} />
                  </label>
                  <label className="block space-y-1 text-[13px]">
                    <span className="font-medium text-slate-700">Internal notes</span>
                    <textarea className="ui-input min-h-20" defaultValue={activeQuote.notes || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { notes: event.target.value || null })} />
                  </label>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
                  <button type="button" onClick={() => void onImportSelected(activeQuote.id)} className="ui-fo-btn-primary h-10 px-5">
                    Import ready rows{selectedCount > 0 ? ` (${selectedCount})` : ''}
                  </button>
                  {activeQuote.sourceFileId ? (
                    <button type="button" onClick={() => void onExtractSourceFile(activeQuote.id, quoteLines.length > 0)} className="ui-btn-secondary h-10 px-4 text-[13px] font-semibold">
                      {quoteLines.length > 0 ? 'Extract rows again from file' : 'Extract rows from file'}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void onDeleteQuote(activeQuote.id)} className="ui-btn-secondary h-10 px-4 text-[13px] font-semibold text-red-700">
                    Delete this quote
                  </button>
                </div>
              </div>
              <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-[12px] text-slate-700">
                <span className="font-semibold text-slate-900">{selectedCount}</span> line{selectedCount === 1 ? '' : 's'} marked <strong>Include</strong> for the estimate. Import sends only included lines.
              </p>
            </div>

            <div className="ui-fo-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900">Paste quote or upload</p>
                  <p className="mt-0.5 text-[12px] text-slate-600">Paste vendor tables or upload CSV/TSV — rows are added to this quote for review.</p>
                </div>
                <label className="ui-btn-secondary h-9 cursor-pointer px-3 text-[12px] font-semibold">
                  Upload CSV / TSV
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      void handleBulkImportFile(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              <textarea
                className="ui-input mt-3 min-h-24 text-[13px]"
                placeholder="Example columns: Description, Manufacturer, SKU, Qty, Unit, Material cost, Notes"
                value={bulkPaste}
                onChange={(event) => {
                  const next = event.target.value;
                  setBulkPaste(next);
                  setBulkPreviewCount(parseQuotePasteText(next).length);
                }}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void handleBulkImportText()} className="ui-btn-secondary h-9 px-3 text-[12px] font-semibold" disabled={!activeQuoteId || bulkPreviewCount === 0}>
                  Add {bulkPreviewCount > 0 ? `${bulkPreviewCount} ` : ''}row{bulkPreviewCount === 1 ? '' : 's'}
                </button>
                <span className="text-[12px] text-slate-500">
                  {bulkPreviewCount > 0 ? `${bulkPreviewCount} rows detected · looks good` : 'No rows detected yet'}
                </span>
              </div>
              <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-[12px] text-sky-950">
                <span className="font-semibold">Tip:</span> Best results come from clean tables or selectable PDF text copied row-for-row.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4">
              <p className="text-[13px] font-semibold text-slate-900">Add one line</p>
              <div className="mt-3 grid gap-2 md:grid-cols-7">
                <input className="ui-input md:col-span-2 text-[13px]" placeholder="Description" value={lineDraft.rawDescription} onChange={(event) => setLineDraft((prev) => ({ ...prev, rawDescription: event.target.value }))} />
                <input className="ui-input text-[13px]" placeholder="Manufacturer" value={lineDraft.manufacturer} onChange={(event) => setLineDraft((prev) => ({ ...prev, manufacturer: event.target.value }))} />
                <input className="ui-input text-[13px]" placeholder="SKU / Model" value={lineDraft.skuModel} onChange={(event) => setLineDraft((prev) => ({ ...prev, skuModel: event.target.value }))} />
                <input className="ui-input text-[13px]" type="number" min="0" step="0.01" placeholder="Qty" value={lineDraft.qty} onChange={(event) => setLineDraft((prev) => ({ ...prev, qty: Number(event.target.value || 0) }))} />
                <input className="ui-input text-[13px]" placeholder="Unit" value={lineDraft.unit} onChange={(event) => setLineDraft((prev) => ({ ...prev, unit: event.target.value }))} />
                <input className="ui-input text-[13px]" type="number" min="0" step="0.01" placeholder="Vendor $" value={lineDraft.materialCost} onChange={(event) => setLineDraft((prev) => ({ ...prev, materialCost: Number(event.target.value || 0) }))} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input className="ui-input min-w-[14rem] flex-1 text-[13px]" placeholder="Notes" value={lineDraft.notes} onChange={(event) => setLineDraft((prev) => ({ ...prev, notes: event.target.value }))} />
                <button type="button" onClick={() => void handleAddLine()} className="ui-btn-secondary h-10 px-4 text-[12px] font-semibold" disabled={!lineDraft.rawDescription.trim()}>
                  Add line
                </button>
              </div>
            </div>

            {quoteLines.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-14 text-center shadow-sm">
                <p className="text-[15px] font-semibold text-slate-900">No vendor rows yet</p>
                <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-slate-600">
                  Upload a quote file, paste a small table, or add lines below. Then review each row, mark Include for bid lines, and import to the estimate.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <span className="font-semibold text-slate-800">{selectedRowIds.length} selected</span>
                    <button type="button" className="font-semibold text-blue-800 underline-offset-2 hover:underline" onClick={() => setSelectedRowIds([])}>
                      Clear
                    </button>
                    <button type="button" className="font-semibold text-blue-800 underline-offset-2 hover:underline" onClick={() => setSelectedRowIds(quoteLines.map((line) => line.id))}>
                      Select all rows
                    </button>
                    <button type="button" className="font-semibold text-slate-800 underline-offset-2 hover:underline disabled:opacity-40" onClick={() => void handleBulkDuplicate()} disabled={selectedRowIds.length === 0}>
                      Duplicate
                    </button>
                    <button type="button" className="font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-40" onClick={() => void handleBulkDelete()} disabled={selectedRowIds.length === 0}>
                      Delete
                    </button>
                    <button type="button" className="font-semibold text-blue-800 underline-offset-2 hover:underline disabled:opacity-40" onClick={() => void handlePromoteSelected(false)} disabled={selectedRowIds.length === 0}>
                      Catalog review
                    </button>
                  </div>
                </div>

                <div className="space-y-5">
                  {renderSection(
                    'Needs review',
                    'Lines not yet marked Include — check descriptions, costs, and type before adding them to the estimate.',
                    buckets.needsReview,
                    {
                      mode: 'default',
                      empty: 'Nothing here — mark Include when a line is ready, or add rows from your vendor file.',
                    },
                  )}
                  {renderSection(
                    'Ready to Import',
                    'Material and accessory rows marked Include — selected for estimate import.',
                    buckets.readyToImport,
                    {
                      mode: 'default',
                      empty: 'No lines marked Include yet.',
                    },
                  )}
                  {renderSection(
                    'Imported to estimate',
                    'Already copied to the estimate (you can still edit the vendor record here).',
                    buckets.imported,
                    {
                      mode: 'imported',
                      empty: 'No lines linked to the estimate yet.',
                    },
                  )}
                  {renderSection(
                    'Excluded / Other',
                    'Sales tax, quote totals, headers, and ignored lines — never imported as material.',
                    buckets.excluded,
                    {
                      mode: 'excluded',
                      empty: 'No excluded rows.',
                    },
                  )}
                  {renderSection(
                    'Terms / Fees',
                    'Freight, minimum order, and payment terms — not auto-selected. If manually included, freight becomes add-in with no automatic labor fallback.',
                    buckets.terms,
                    {
                      mode: 'terms',
                      empty: 'No notes or freight rows.',
                    },
                  )}
                  {buckets.other.length > 0
                    ? renderSection('Other rows', 'Choose a line type (for example Material) so these rows sort into review or import.', buckets.other, {
                        mode: 'default',
                        empty: '',
                      })
                    : null}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-[15px] font-semibold text-slate-900">Choose a quote</p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-slate-600">Pick a quote on the left or create a new one to start reviewing vendor lines.</p>
          </div>
        )}
      </section>
    </div>
  );
}
