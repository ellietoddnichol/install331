import React, { useMemo, useState } from 'react';
import type { ProjectFileRecord, SourceQuoteLineRecord, SourceQuoteRecord } from '../../shared/types/estimator';
import { formatCurrencySafe } from '../../utils/numberFormat';
import { parseTabularQuoteText } from '../../shared/utils/quoteStagingParser';

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

function importStatusLabel(status: SourceQuoteRecord['importStatus']): string {
  if (status === 'imported') return 'imported';
  if (status === 'ready_to_import' || status === 'partially_imported') return 'staged';
  return 'draft';
}

export function QuotesPage({
  quotes,
  activeQuoteId,
  setActiveQuoteId,
  quoteLines,
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
    const rows = parseTabularQuoteText(bulkPaste).map((row) => ({
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
    const rows = parseTabularQuoteText(text).map((row) => ({
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

  const allRowsSelected = quoteLines.length > 0 && selectedRowIds.length === quoteLines.length;

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <section className="ui-surface space-y-4 p-5">
          <div>
            <p className="ui-mono-kicker">Quotes</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Quote intake workbench</h2>
            <p className="mt-1 text-sm text-slate-600">Create a quote, stage rows, and import selected rows into the estimate.</p>
          </div>
          <div className="space-y-3 text-sm">
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
              <span className="font-medium text-slate-700">Source file</span>
              <input type="file" className="ui-input file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold" onChange={(event) => setQuoteDraft((prev) => ({ ...prev, file: event.target.files?.[0] || null }))} />
            </label>
            <label className="space-y-1.5">
              <span className="font-medium text-slate-700">Notes</span>
              <textarea className="ui-input min-h-24" value={quoteDraft.notes} onChange={(event) => setQuoteDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Scope summary or file notes" />
            </label>
            <button type="button" onClick={() => void handleCreateQuote()} className="ui-btn-cta w-full disabled:opacity-60" disabled={!quoteDraft.vendorName.trim() || fileUploading}>
              {fileUploading ? 'Uploading file…' : 'Create quote'}
            </button>
          </div>
        </section>

        <section className="ui-surface p-3">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="ui-mono-kicker">Project quotes</p>
            <span className="text-xs font-medium text-slate-500">{quotes.length}</span>
          </div>
          <div className="mt-2 space-y-2">
            {quotes.map((quote) => {
              const fileLabel = quote.sourceFileId ? projectFilesById.get(quote.sourceFileId)?.fileName || 'Attached file' : 'No file attached';
              const active = quote.id === activeQuoteId;
              return (
                <button
                  key={quote.id}
                  type="button"
                  onClick={() => setActiveQuoteId(quote.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    active ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{quote.vendorName}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{quote.quoteNumber || 'No quote #'} · {quote.quoteDate || 'No date'}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{fileLabel}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${
                      importStatusLabel(quote.importStatus) === 'imported'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : importStatusLabel(quote.importStatus) === 'staged'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-white text-slate-600'
                    }`}>
                      {importStatusLabel(quote.importStatus)}
                    </span>
                  </div>
                </button>
              );
            })}
            {quotes.length === 0 ? <p className="px-2 py-3 text-sm text-slate-500">No quotes yet.</p> : null}
          </div>
        </section>
      </aside>

      <section className="ui-surface p-5">
        {activeQuote ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Quote header</p>
                <input
                  className="w-full border-0 bg-transparent p-0 text-[22px] font-semibold tracking-tight text-slate-950 focus:outline-none"
                  defaultValue={activeQuote.vendorName}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== activeQuote.vendorName) void onUpdateQuote(activeQuote.id, { vendorName: value });
                  }}
                />
                <div className="mt-2 grid gap-3 md:grid-cols-4">
                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">Quote number</span>
                    <input className="ui-input" defaultValue={activeQuote.quoteNumber || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { quoteNumber: event.target.value || null })} />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">Quote date</span>
                    <input className="ui-input" type="date" defaultValue={activeQuote.quoteDate || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { quoteDate: event.target.value || null })} />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">Delivery date</span>
                    <input className="ui-input" type="date" defaultValue={activeQuote.deliveryDate || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { deliveryDate: event.target.value || null })} />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">Status</span>
                    <input className="ui-input" value={importStatusLabel(activeQuote.importStatus)} disabled readOnly />
                  </label>
                </div>
                <label className="mt-3 block space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">Ship-to / project reference</span>
                  <input className="ui-input" defaultValue={activeQuote.shipTo || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { shipTo: event.target.value || null })} />
                </label>
                <label className="mt-3 block space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">Notes</span>
                  <textarea className="ui-input min-h-20" defaultValue={activeQuote.notes || ''} onBlur={(event) => void onUpdateQuote(activeQuote.id, { notes: event.target.value || null })} />
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  Workflow: stage rows here, mark import rows, then import selected to estimate.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => void onImportSelected(activeQuote.id)} className="ui-btn-cta">
                  Import {selectedCount > 0 ? `${selectedCount} selected` : 'selected'} to estimate
                </button>
                {activeQuote.sourceFileId ? (
                  <button
                    type="button"
                    onClick={() => void onExtractSourceFile(activeQuote.id, quoteLines.length > 0)}
                    className="ui-btn-secondary h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.06em]"
                  >
                    {quoteLines.length > 0 ? 'Re-parse source file' : 'Parse source file'}
                  </button>
                ) : null}
                <button type="button" onClick={() => void onDeleteQuote(activeQuote.id)} className="ui-btn-secondary h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-red-700">
                  Delete quote
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-900">
              <span className="font-semibold">Ready now:</span> {selectedCount} row{selectedCount === 1 ? '' : 's'} marked for estimate import.
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">Bulk row intake</p>
                <label className="ui-btn-secondary h-9 cursor-pointer px-3 text-[11px] font-semibold uppercase tracking-[0.06em]">
                  Load CSV / TSV
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
              <p className="mt-2 text-xs text-slate-500">Paste quote rows with columns like description, qty, unit, and cost. Parsed rows are appended to this quote.</p>
              <textarea
                className="ui-input mt-3 min-h-24"
                placeholder="Description,Manufacturer,SKU,Qty,Unit,Material Cost,Notes"
                value={bulkPaste}
                onChange={(event) => {
                  const next = event.target.value;
                  setBulkPaste(next);
                  setBulkPreviewCount(parseTabularQuoteText(next).length);
                }}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleBulkImportText()}
                  className="ui-btn-secondary h-9 px-3 text-[11px] font-semibold uppercase tracking-[0.06em]"
                  disabled={!activeQuoteId || bulkPreviewCount === 0}
                >
                  Add {bulkPreviewCount > 0 ? bulkPreviewCount : ''} parsed row{bulkPreviewCount === 1 ? '' : 's'}
                </button>
                <span className="text-xs text-slate-500">{bulkPreviewCount > 0 ? `${bulkPreviewCount} rows ready` : 'No parsed rows yet'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 md:grid-cols-7">
                <input className="ui-input md:col-span-2" placeholder="Description" value={lineDraft.rawDescription} onChange={(event) => setLineDraft((prev) => ({ ...prev, rawDescription: event.target.value }))} />
                <input className="ui-input" placeholder="Manufacturer" value={lineDraft.manufacturer} onChange={(event) => setLineDraft((prev) => ({ ...prev, manufacturer: event.target.value }))} />
                <input className="ui-input" placeholder="SKU / Model" value={lineDraft.skuModel} onChange={(event) => setLineDraft((prev) => ({ ...prev, skuModel: event.target.value }))} />
                <input className="ui-input" type="number" min="0" step="0.01" placeholder="Qty" value={lineDraft.qty} onChange={(event) => setLineDraft((prev) => ({ ...prev, qty: Number(event.target.value || 0) }))} />
                <input className="ui-input" placeholder="Unit" value={lineDraft.unit} onChange={(event) => setLineDraft((prev) => ({ ...prev, unit: event.target.value }))} />
                <input className="ui-input" type="number" min="0" step="0.01" placeholder="Material cost" value={lineDraft.materialCost} onChange={(event) => setLineDraft((prev) => ({ ...prev, materialCost: Number(event.target.value || 0) }))} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input className="ui-input min-w-[16rem] flex-1" placeholder="Notes" value={lineDraft.notes} onChange={(event) => setLineDraft((prev) => ({ ...prev, notes: event.target.value }))} />
                <button type="button" onClick={() => void handleAddLine()} className="ui-btn-secondary h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.06em]" disabled={!lineDraft.rawDescription.trim()}>
                  Add quote line
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.06em] text-slate-500">
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allRowsSelected}
                        onChange={(event) => setSelectedRowIds(event.target.checked ? quoteLines.map((line) => line.id) : [])}
                        aria-label="Select all quote rows"
                      />
                    </th>
                    <th className="px-3 py-2">Import</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">SKU / Model</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2 text-right">Material</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteLines.length > 0 ? (
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      <td colSpan={9} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-700">{selectedRowIds.length} selected</span>
                          <button type="button" className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2" onClick={() => setSelectedRowIds([])}>
                            Clear
                          </button>
                          <button type="button" className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2" onClick={() => setSelectedRowIds(quoteLines.map((line) => line.id))}>
                            Select all
                          </button>
                          <button type="button" className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 disabled:opacity-40" onClick={() => void handleBulkDuplicate()} disabled={selectedRowIds.length === 0}>
                            Duplicate selected
                          </button>
                          <button type="button" className="font-semibold text-red-700 underline decoration-red-200 underline-offset-2 disabled:opacity-40" onClick={() => void handleBulkDelete()} disabled={selectedRowIds.length === 0}>
                            Delete selected
                          </button>
                          <button type="button" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 disabled:opacity-40" onClick={() => void handlePromoteSelected(false)} disabled={selectedRowIds.length === 0}>
                            Promote selected to Catalog Review
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {quoteLines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedRowIds.includes(line.id)}
                          onChange={(event) => toggleRowSelected(line.id, event.target.checked)}
                          aria-label="Select quote row"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={line.importSelected} onChange={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { importSelected: event.target.checked })} />
                      </td>
                      <td className="px-3 py-2 min-w-[9rem]">
                        <select
                          className="ui-input"
                          defaultValue={line.rowType}
                          onChange={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { rowType: event.target.value as SourceQuoteLineRecord['rowType'] })}
                        >
                          <option value="material">material</option>
                          <option value="accessory">accessory</option>
                          <option value="freight">freight</option>
                          <option value="installation">installation</option>
                          <option value="service">service</option>
                          <option value="note">note</option>
                          <option value="ignore">ignore</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 min-w-[20rem]">
                        <textarea className="ui-input min-h-20" defaultValue={line.rawDescription} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { rawDescription: event.target.value, normalizedDescription: event.target.value })} />
                        <textarea className="ui-input mt-1.5 min-h-14" placeholder="Notes" defaultValue={line.notes || ''} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { notes: event.target.value || null })} />
                      </td>
                      <td className="px-3 py-2 min-w-[10rem]">
                        <input className="ui-input" defaultValue={line.skuModel || ''} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { skuModel: event.target.value || null })} />
                        <input className="ui-input mt-1.5" placeholder="Manufacturer" defaultValue={line.manufacturer || ''} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { manufacturer: event.target.value || null })} />
                      </td>
                      <td className="px-3 py-2 min-w-[6rem]">
                        <input className="ui-input text-right" type="number" min="0" step="0.01" defaultValue={line.qty} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { qty: Number(event.target.value || 0) || 1 })} />
                      </td>
                      <td className="px-3 py-2 min-w-[5rem]">
                        <input className="ui-input" defaultValue={line.unit} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { unit: event.target.value || 'EA' })} />
                      </td>
                      <td className="px-3 py-2 min-w-[8rem]">
                        <input className="ui-input text-right" type="number" min="0" step="0.01" defaultValue={line.materialCost} onBlur={(event) => void onUpdateQuoteLine(activeQuote.id, line.id, { materialCost: Number(event.target.value || 0) })} />
                        <p className="mt-1 text-right text-xs text-slate-500">{formatCurrencySafe(line.materialCost)}</p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => void handleDuplicateLine(line)} className="mr-3 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600 hover:text-slate-800">
                          Duplicate
                        </button>
                        <button type="button" onClick={() => void onDeleteQuoteLine(activeQuote.id, line.id)} className="text-xs font-semibold uppercase tracking-[0.06em] text-red-700 hover:text-red-800">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {quoteLines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                        No quote lines yet. Add rows here, then import the selected rows into the estimate builder.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[28rem] items-center justify-center text-center text-sm text-slate-500">
            Select a quote on the left or create a new one to start staging vendor rows.
          </div>
        )}
      </section>
    </div>
  );
}