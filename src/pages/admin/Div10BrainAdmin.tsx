import React, { useCallback, useState } from 'react';
import { getErrorMessage } from '../../shared/utils/errorMessage.ts';

const STORAGE_KEY = 'div10_brain_admin_secret';

function apiBase() {
  return '/api/v1/div10-brain';
}

export function Div10BrainAdmin() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem(STORAGE_KEY) || '');
  const [documents, setDocuments] = useState<unknown[]>([]);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [training, setTraining] = useState<unknown[]>([]);
  const [retrieveQuery, setRetrieveQuery] = useState('toilet partition hardware');
  const [retrieveOut, setRetrieveOut] = useState<string>('');
  const [classifyLine, setClassifyLine] = useState('Supply and install phenolic toilet partitions, floor mounted.');
  const [classifyOut, setClassifyOut] = useState<string>('');
  const [registerBucket, setRegisterBucket] = useState('manufacturer-docs');
  const [registerPath, setRegisterPath] = useState('sample/spec.pdf');
  const [processDocId, setProcessDocId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret.trim()) {
      h.Authorization = `Bearer ${secret.trim()}`;
    }
    return h;
  }, [secret]);

  const persistSecret = () => {
    sessionStorage.setItem(STORAGE_KEY, secret.trim());
  };

  const loadDocs = async () => {
    setError(null);
    persistSecret();
    const res = await fetch(`${apiBase()}/documents`, { headers: headers() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    setDocuments((body.data as unknown[]) || []);
  };

  const loadLogs = async () => {
    setError(null);
    persistSecret();
    const res = await fetch(`${apiBase()}/ai/logs?limit=40`, { headers: headers() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    setLogs((body.data as unknown[]) || []);
  };

  const loadTraining = async () => {
    setError(null);
    persistSecret();
    const res = await fetch(`${apiBase()}/training/examples?limit=80`, { headers: headers() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    setTraining((body.data as unknown[]) || []);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Request failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 text-slate-800">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Div 10 Brain (internal)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Server-side Supabase + OpenAI tools. Paste <code className="rounded bg-slate-100 px-1">DIV10_BRAIN_ADMIN_SECRET</code> for API
          calls. Nothing here changes estimator pricing math.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">Admin secret</label>
        <input
          type="password"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="DIV10_BRAIN_ADMIN_SECRET"
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-slate-500">Stored in sessionStorage for this tab only.</p>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Knowledge documents</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => run(loadDocs)}
          >
            Load / refresh list
          </button>
        </div>
        <ul className="mt-4 max-h-80 space-y-2 overflow-auto text-sm">
          {documents.map(
            (d: {
              id: string;
              storage_path: string;
              ingestion_status: string;
              chunk_count?: number;
              ingestion_error?: string | null;
              doc_type?: string;
            }) => (
              <li key={d.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 font-mono text-xs">
                <div>
                  <span className="text-slate-500">{d.doc_type || '—'}</span> · {d.ingestion_status} · chunks {d.chunk_count ?? '—'}
                </div>
                <div className="break-all text-slate-800">{d.storage_path}</div>
                {d.ingestion_error ? <div className="mt-0.5 text-[11px] text-amber-900">{d.ingestion_error}</div> : null}
                <button type="button" className="mt-0.5 text-blue-700 underline" onClick={() => setProcessDocId(d.id)}>
                  use id for process
                </button>
              </li>
            )
          )}
        </ul>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <input
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={registerBucket}
            onChange={(e) => setRegisterBucket(e.target.value)}
            placeholder="storage bucket"
          />
          <input
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={registerPath}
            onChange={(e) => setRegisterPath(e.target.value)}
            placeholder="storage path"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          onClick={() =>
            run(async () => {
              persistSecret();
              const res = await fetch(`${apiBase()}/documents/register`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                  storage_bucket: registerBucket.trim(),
                  storage_path: registerPath.trim(),
                  doc_type: 'reference',
                }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(body.error || res.statusText);
              await loadDocs();
            })
          }
        >
          Register metadata row
        </button>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <input
            className="min-w-[240px] flex-1 rounded-md border border-slate-300 px-2 py-1 font-mono text-sm"
            value={processDocId}
            onChange={(e) => setProcessDocId(e.target.value)}
            placeholder="document uuid to process (download → extract → chunk → embed)"
          />
          <button
            type="button"
            disabled={busy || !processDocId.trim()}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() =>
              run(async () => {
                persistSecret();
                const res = await fetch(`${apiBase()}/documents/${processDocId.trim()}/process`, {
                  method: 'POST',
                  headers: headers(),
                  body: JSON.stringify({}),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.error || res.statusText);
                setRetrieveOut(JSON.stringify(body.data, null, 2));
                await loadDocs();
              })
            }
          >
            Reprocess pipeline
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Retrieval test</h2>
        <textarea
          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-2 font-mono text-sm"
          rows={2}
          value={retrieveQuery}
          onChange={(e) => setRetrieveQuery(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() =>
            run(async () => {
              persistSecret();
              const res = await fetch(`${apiBase()}/retrieve/knowledge`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ query: retrieveQuery, topK: 8, filters: {} }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(body.error || res.statusText);
              setRetrieveOut(JSON.stringify(body.data, null, 2));
            })
          }
        >
          Run semantic retrieve
        </button>
        {retrieveOut && (
          <pre className="mt-3 max-h-80 overflow-auto rounded bg-slate-900 p-3 text-xs text-emerald-100">{retrieveOut}</pre>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Classify intake line</h2>
        <textarea
          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
          rows={3}
          value={classifyLine}
          onChange={(e) => setClassifyLine(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() =>
            run(async () => {
              persistSecret();
              const res = await fetch(`${apiBase()}/ai/classify-intake-line`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ line_text: classifyLine }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(body.error || res.statusText);
              setClassifyOut(JSON.stringify(body.data, null, 2));
              await loadLogs();
            })
          }
        >
          Run classifyIntakeLine
        </button>
        {classifyOut && <pre className="mt-3 max-h-80 overflow-auto rounded bg-slate-900 p-3 text-xs text-sky-100">{classifyOut}</pre>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-slate-900">AI run logs</h2>
          <button type="button" className="text-sm text-blue-700 underline" onClick={() => run(loadLogs)}>
            Refresh
          </button>
        </div>
        <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-xs">
          {logs.map((row: { id: string; task_type: string; model: string; latency_ms: number; created_at: string }) => (
            <li key={row.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
              {row.created_at} · {row.task_type} · {row.model} · {row.latency_ms}ms
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-slate-900">Training examples</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-sm text-blue-700 underline"
              onClick={() => run(loadTraining)}
            >
              Refresh
            </button>
            <button
              type="button"
              className="text-sm text-blue-700 underline disabled:opacity-50"
              disabled={busy || !secret.trim()}
              onClick={() =>
                run(async () => {
                  persistSecret();
                  const res = await fetch(`${apiBase()}/training/export.jsonl`, { headers: headers() });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error((body as { error?: string }).error || res.statusText);
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'training-approved.jsonl';
                  a.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              Download approved JSONL
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">Export uses your admin secret in the Authorization header.</p>
        <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-xs">
          {training.map((row: { id: string; task_type: string; approved: boolean }) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1">
              <span>
                {row.task_type} · {row.approved ? 'approved' : 'draft'}
              </span>
              <button
                type="button"
                className="text-blue-700 underline"
                onClick={() =>
                  run(async () => {
                    persistSecret();
                    const res = await fetch(`${apiBase()}/training/examples/${row.id}`, {
                      method: 'PATCH',
                      headers: headers(),
                      body: JSON.stringify({ approved: !row.approved }),
                    });
                    const body = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(body.error || res.statusText);
                    await loadTraining();
                  })
                }
              >
                Toggle approved
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
