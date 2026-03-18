import React, { useMemo, useState } from 'react';
import { CatalogItem } from '../../types';
import { TakeoffLineRecord } from '../../shared/types/estimator';

interface ReviewLine extends Partial<TakeoffLineRecord> {
  reviewStatus: 'accepted' | 'rejected' | 'pending';
  confidence: number;
  rawText: string;
}

interface Props {
  catalog: CatalogItem[];
  projectId: string;
  roomId: string;
  onFinalize: (lines: Array<Partial<TakeoffLineRecord>>) => Promise<void>;
  variant?: 'compact' | 'expanded';
}

export function ImportParsePanel({ catalog, projectId, roomId, onFinalize, variant = 'compact' }: Props) {
  const [rawText, setRawText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [status, setStatus] = useState<'idle' | 'parsing' | 'ready' | 'error' | 'saving'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);

  const acceptedLines = useMemo(() => reviewLines.filter((line) => line.reviewStatus === 'accepted'), [reviewLines]);
  const pendingLines = useMemo(() => reviewLines.filter((line) => line.reviewStatus === 'pending'), [reviewLines]);
  const rejectedLines = useMemo(() => reviewLines.filter((line) => line.reviewStatus === 'rejected'), [reviewLines]);

  function normalizeLine(rawLine: string): ReviewLine {
    const qtyMatch = rawLine.match(/^(\d+(?:\.\d+)?)\s+/);
    const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
    const normalized = rawLine.replace(/^(\d+(?:\.\d+)?)\s+/, '').toLowerCase();
    const match = catalog.find((item) => normalized.includes(item.sku.toLowerCase()) || normalized.includes(item.description.toLowerCase()));

    if (match) {
      return {
        projectId,
        roomId,
        sourceType: 'parser',
        description: match.description,
        sku: match.sku,
        category: match.category,
        subcategory: match.subcategory || null,
        qty,
        unit: match.uom,
        materialCost: match.baseMaterialCost,
        laborMinutes: match.baseLaborMinutes,
        laborCost: 0,
        catalogItemId: match.id,
        notes: `Parsed from import: ${rawLine}`,
        reviewStatus: 'accepted',
        confidence: 0.92,
        rawText: rawLine,
      };
    }

    return {
      projectId,
      roomId,
      sourceType: 'parser',
      description: rawLine,
      qty,
      unit: 'EA',
      materialCost: 0,
      laborMinutes: 0,
      laborCost: 0,
      notes: 'Needs review',
      reviewStatus: 'pending',
      confidence: 0.45,
      rawText: rawLine,
    };
  }

  function parseInput(text: string) {
    setStatus('parsing');
    setStatusMessage('Parsing scope lines...');

    try {
      const parsed = text
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(normalizeLine);

      setReviewLines(parsed);
      setStatus('ready');
      setStatusMessage(`${parsed.length} lines parsed. Review and accept before importing.`);
    } catch (error: any) {
      setStatus('error');
      setStatusMessage(`Parse failed: ${error.message}`);
    }
  }

  function handleParseText() {
    if (!rawText.trim()) {
      setStatus('error');
      setStatusMessage('Paste scope text before parsing.');
      return;
    }

    parseInput(rawText);
  }

  function handleFileUpload(file: File | undefined) {
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setRawText(text);
      parseInput(text);
    };
    reader.onerror = () => {
      setStatus('error');
      setStatusMessage('Unable to read uploaded file.');
    };
    reader.readAsText(file);
  }

  function patchReviewLine(index: number, updates: Partial<ReviewLine>) {
    setReviewLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...updates } : line)));
  }

  async function finalizeAcceptedLines() {
    if (!roomId) {
      setStatus('error');
      setStatusMessage('Select a room before finalizing parsed lines.');
      return;
    }
    if (acceptedLines.length === 0) {
      setStatus('error');
      setStatusMessage('Accept at least one parsed line before importing.');
      return;
    }

    setStatus('saving');
    setStatusMessage('Importing accepted lines...');

    try {
      const payload = acceptedLines.map((line) => ({
        ...line,
        projectId,
        roomId,
        reviewStatus: undefined,
        confidence: undefined,
        rawText: undefined,
      }));
      await onFinalize(payload);
      setStatus('idle');
      setStatusMessage('Import complete.');
      setRawText('');
      setReviewLines([]);
      setUploadedFileName('');
    } catch (error: any) {
      setStatus('error');
      setStatusMessage(`Import failed: ${error.message}`);
    }
  }

  function resetImport() {
    setRawText('');
    setReviewLines([]);
    setUploadedFileName('');
    setStatus('idle');
    setStatusMessage('');
  }

  const reviewHeightClass = variant === 'expanded' ? 'max-h-[52vh]' : 'max-h-44';
  const containerClass = variant === 'expanded'
    ? 'space-y-4'
    : 'space-y-3 rounded-[22px] border border-slate-200/80 bg-white/85 p-3 shadow-sm';
  const textAreaRows = variant === 'expanded' ? 10 : 4;

  const statusTone = status === 'error'
    ? 'border-red-200 bg-red-50 text-red-700'
    : status === 'ready'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'parsing' || status === 'saving'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-slate-200 bg-slate-100 text-slate-600';

  const content = (
    <div className={containerClass}>
      <div className={variant === 'expanded' ? 'grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_320px]' : 'space-y-3'}>
        <section className={variant === 'expanded' ? 'rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-sm' : 'space-y-3'}>
          {variant === 'expanded' ? (
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Parser Workspace</p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Upload, inspect, and stage scope lines</h3>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">Paste scope text or upload a flat file, then confirm which lines should become takeoff entries before they reach the estimate.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200/80">Room target required</span>
                <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-blue-800 shadow-sm ring-1 ring-blue-200/80">Accepted {acceptedLines.length}</span>
              </div>
            </div>
          ) : null}

          <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Raw Scope Input</p>
              {uploadedFileName ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{uploadedFileName}</span> : null}
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste bid scope lines here..."
              rows={textAreaRows}
              className="min-h-[140px] w-full rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={handleParseText} className="inline-flex h-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,#164fa8_100%)] px-4 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(11,61,145,0.22)] hover:brightness-[1.03]">Parse Text</button>
              <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50">
                Upload File
                <input type="file" accept=".txt,.csv" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
              </label>
              <button onClick={() => void finalizeAcceptedLines()} disabled={acceptedLines.length === 0 || status === 'saving'} className="inline-flex h-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">Finalize Accepted</button>
              <button onClick={resetImport} className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50">Reset</button>
            </div>
          </div>
        </section>

        <aside className={variant === 'expanded' ? 'space-y-3' : 'grid grid-cols-2 gap-2'}>
          <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Review Queue</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-[var(--brand-soft)] px-2 py-3">
                <p className="text-[18px] font-semibold tracking-[-0.04em] text-slate-950">{acceptedLines.length}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-blue-800">Include</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-2 py-3">
                <p className="text-[18px] font-semibold tracking-[-0.04em] text-slate-950">{pendingLines.length}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700">Review</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-2 py-3">
                <p className="text-[18px] font-semibold tracking-[-0.04em] text-slate-950">{rejectedLines.length}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">Ignore</p>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Parser Status</p>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}>{status}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">{statusMessage || 'Accepted lines will be created as takeoff items when finalized.'}</p>
            <div className="mt-3 rounded-2xl bg-slate-50/80 p-3 text-[11px] leading-5 text-slate-500">
              Keep metadata, headers, and setup text out of the final import by leaving only true scope lines marked as Include.
            </div>
          </div>
        </aside>
      </div>

      {reviewLines.length > 0 && (
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-[linear-gradient(180deg,#fcfdff_0%,#f5f8fd_100%)] px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Parsed Review Table</p>
              <h4 className="mt-1 text-sm font-semibold text-slate-900">Confirm each line before import</h4>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200/80">{reviewLines.length} parsed lines</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">Room-scoped import</span>
            </div>
          </div>
          <div className={`${reviewHeightClass} overflow-y-auto`}>
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-slate-100/95 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Unit</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {reviewLines.map((line, index) => {
                  const confidence = Math.round((line.confidence || 0) * 100);
                  const rowTone = line.reviewStatus === 'accepted'
                    ? 'bg-emerald-50/35'
                    : line.reviewStatus === 'pending'
                      ? 'bg-amber-50/45'
                      : 'bg-slate-50/55';

                  return (
                    <tr key={`${line.rawText}-${index}`} className={`border-t border-slate-100 align-top ${rowTone}`}>
                      <td className="px-3 py-2">
                        <select
                          value={line.reviewStatus}
                          onChange={(e) => patchReviewLine(index, { reviewStatus: e.target.value as ReviewLine['reviewStatus'] })}
                          className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        >
                          <option value="accepted">Include</option>
                          <option value="pending">Review</option>
                          <option value="rejected">Ignore</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={line.description || ''}
                          onChange={(e) => patchReviewLine(index, { description: e.target.value })}
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        />
                        <p className="mt-1.5 line-clamp-1 text-[10px] text-slate-500">Raw: {line.rawText}</p>
                      </td>
                      <td className="w-20 px-3 py-2">
                        <input
                          type="number"
                          value={line.qty || 0}
                          onChange={(e) => patchReviewLine(index, { qty: Number(e.target.value) || 0 })}
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        />
                      </td>
                      <td className="w-24 px-3 py-2">
                        <input
                          value={line.unit || 'EA'}
                          onChange={(e) => patchReviewLine(index, { unit: e.target.value })}
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${confidence >= 85 ? 'bg-emerald-100 text-emerald-700' : confidence >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{confidence}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );

  if (variant === 'expanded') {
    return (
      <div className="space-y-2">
        {content}
      </div>
    );
  }

  return (
    <details className="space-y-2" open={reviewLines.length > 0 || status === 'error'}>
      <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-500">Upload / Import / Parse</summary>
      {content}
    </details>
  );
}
