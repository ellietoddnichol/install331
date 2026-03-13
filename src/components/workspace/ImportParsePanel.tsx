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

  const content = (
    <div className="space-y-3 pt-1">
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste bid scope lines here..."
          rows={variant === 'expanded' ? 8 : 4}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        />

        <div className="flex flex-wrap gap-2">
          <button onClick={handleParseText} className="h-7 px-2.5 rounded border border-slate-300 text-[11px] font-medium hover:bg-slate-50">Parse Text</button>
          <label className="h-7 px-2.5 rounded border border-slate-300 text-[11px] font-medium hover:bg-slate-50 inline-flex items-center cursor-pointer">
            Upload File
            <input type="file" accept=".txt,.csv" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
          </label>
          <button onClick={() => void finalizeAcceptedLines()} disabled={acceptedLines.length === 0 || status === 'saving'} className="h-7 px-2.5 rounded bg-blue-700 text-white text-[11px] font-medium disabled:bg-blue-300">Finalize Accepted</button>
          <button onClick={resetImport} className="h-7 px-2.5 rounded border border-slate-300 text-[11px] font-medium hover:bg-slate-50">Reset</button>
        </div>

        {uploadedFileName ? <p className="text-[11px] text-slate-500">Uploaded: {uploadedFileName}</p> : null}
        {status !== 'idle' ? (
          <p className={`text-[11px] ${status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>{statusMessage}</p>
        ) : null}

        {reviewLines.length > 0 && (
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className={`${reviewHeightClass} overflow-y-auto`}>
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">Status</th>
                    <th className="px-2 py-1 text-left">Description</th>
                    <th className="px-2 py-1 text-left">Qty</th>
                    <th className="px-2 py-1 text-left">Unit</th>
                    <th className="px-2 py-1 text-left">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewLines.map((line, index) => (
                    <tr key={`${line.rawText}-${index}`} className="border-t border-slate-100">
                      <td className="px-2 py-1">
                        <select
                          value={line.reviewStatus}
                          onChange={(e) => patchReviewLine(index, { reviewStatus: e.target.value as ReviewLine['reviewStatus'] })}
                          className="h-7 rounded border border-slate-300 px-1"
                        >
                          <option value="accepted">Include</option>
                          <option value="pending">Review</option>
                          <option value="rejected">Ignore</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={line.description || ''}
                          onChange={(e) => patchReviewLine(index, { description: e.target.value })}
                          className="h-7 w-full rounded border border-slate-300 px-1"
                        />
                      </td>
                      <td className="px-2 py-1 w-14">
                        <input
                          type="number"
                          value={line.qty || 0}
                          onChange={(e) => patchReviewLine(index, { qty: Number(e.target.value) || 0 })}
                          className="h-7 w-full rounded border border-slate-300 px-1"
                        />
                      </td>
                      <td className="px-2 py-1 w-16">
                        <input
                          value={line.unit || 'EA'}
                          onChange={(e) => patchReviewLine(index, { unit: e.target.value })}
                          className="h-7 w-full rounded border border-slate-300 px-1"
                        />
                      </td>
                      <td className="px-2 py-1 text-slate-600">{Math.round((line.confidence || 0) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
  );

  if (variant === 'expanded') {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Upload / Import / Parse</h3>
        <p className="text-xs text-slate-500">Upload or paste scope text, then review and include/ignore lines before importing.</p>
        {content}
      </div>
    );
  }

  return (
    <details className="space-y-2" open={reviewLines.length > 0 || status === 'error'}>
      <summary className="text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none">Upload / Import / Parse</summary>
      {content}
    </details>
  );
}
