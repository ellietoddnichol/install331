/**
 * API-level MVP smoke (no browser). Run: npx tsx scripts/mvp-api-smoke.ts
 * Requires dev server on SMOKE_HTTP_BASE (default http://127.0.0.1:3000).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const [file, override] of [
  ['.env', false],
  ['.env.local', true],
] as const) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) dotenv.config({ path: full, override });
}

const BASE = String(process.env.SMOKE_HTTP_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

type StepResult = { step: string; ok: boolean; ms: number; detail?: string };

const results: StepResult[] = [];

async function api<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; ms: number; json: T | null; text: string }> {
  const url = `${BASE}${path}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, ms, json, text: text.slice(0, 400) };
}

function record(step: string, ok: boolean, ms: number, detail?: string) {
  results.push({ step, ok, ms, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${step} (${ms}ms)${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`MVP API smoke → ${BASE}\n`);

  const health = await api<{ database?: string }>('GET', '/api/v1/health');
  record('Health (sqlite)', health.ok && health.json?.database === 'sqlite', health.ms, `db=${health.json?.database}`);

  const created = await api<{ data: { id: string; name: string } }>('POST', '/api/v1/projects', {
    name: `Smoke QA ${new Date().toISOString().slice(0, 16)}`,
    customerName: 'Smoke Test GC',
    clientName: 'Smoke Test GC',
    projectAddress: '123 Test St, Chicago, IL',
    proposalMode: 'full',
  });
  const projectId = created.json?.data?.id;
  record('Create project', created.ok && Boolean(projectId), created.ms, projectId ? `id=${projectId.slice(0, 8)}…` : created.text);

  if (!projectId) {
    console.log('\nAborting — project create failed.');
    process.exit(1);
  }

  const updated = await api('PUT', `/api/v1/projects/${projectId}`, {
    wallSubstrate: 'drywall',
    blockingBackingStatus: 'unknown',
    taxEnabled: true,
    taxRate: 0.1025,
  });
  record('Save setup fields', updated.ok, updated.ms);

  const pdfBytes = Buffer.from(
    'Bobrick Quote\nB-6806 x 2 EA $120\nB-822 Soap Dispenser 1 EA $85\n',
    'utf8'
  );
  const fileRes = await api<{ data: { id: string; fileName: string } }>(
    'POST',
    `/api/v1/projects/${projectId}/files`,
    {
      fileName: 'smoke-bobrick-quote.txt',
      mimeType: 'text/plain',
      sizeBytes: pdfBytes.length,
      dataBase64: pdfBytes.toString('base64'),
    }
  );
  const fileId = fileRes.json?.data?.id;
  record('Upload file (GCS path)', fileRes.ok && Boolean(fileId), fileRes.ms, fileRes.ok ? fileId?.slice(0, 8) : fileRes.text);

  if (fileId) {
    const dl = await api('GET', `/api/v1/projects/${projectId}/files/${fileId}/download`);
    record('Download file from GCS', dl.ok && dl.text.includes('Bobrick'), dl.ms);
  }

  const quoteRes = await api<{ data: { id: string } }>('POST', '/api/v1/quotes', {
    projectId,
    vendorName: 'Bobrick',
    sourceFileId: fileId ?? null,
  });
  const quoteId = quoteRes.json?.data?.id;
  record('Create vendor quote', quoteRes.ok && Boolean(quoteId), quoteRes.ms);

  if (!quoteId) {
    console.log('\nAborting — quote create failed.');
    process.exit(1);
  }

  const bulk = await api<{ data: unknown[] }>('POST', `/api/v1/quotes/${quoteId}/lines/bulk`, {
    rows: [
      {
        rawDescription: 'Bobrick Grab Bar B-6806 36in',
        manufacturer: 'Bobrick',
        skuModel: 'B-6806-36',
        qty: 2,
        unit: 'EA',
        unitCost: 120,
        materialCost: 240,
        rowType: 'material',
        importSelected: true,
      },
      {
        rawDescription: 'Bobrick Soap Dispenser B-822',
        manufacturer: 'Bobrick',
        skuModel: 'B-822',
        qty: 1,
        unit: 'EA',
        unitCost: 85,
        materialCost: 85,
        rowType: 'material',
        importSelected: true,
      },
    ],
  });
  record('Stage quote rows (bulk)', bulk.ok && (bulk.json?.data?.length ?? 0) >= 2, bulk.ms, `rows=${bulk.json?.data?.length ?? 0}`);

  const imported = await api<{ data: unknown[] }>('POST', `/api/v1/quotes/${quoteId}/import-selected`);
  const lineCount = Array.isArray(imported.json?.data) ? imported.json!.data.length : 0;
  record('Import rows to estimate', imported.ok && lineCount > 0, imported.ms, `estimateLines=${lineCount}`);

  const lines = await api<{ data: Array<{ id: string; description?: string; proposalVisibility?: string }> }>(
    'GET',
    `/api/v1/takeoff/lines?projectId=${encodeURIComponent(projectId)}`
  );
  const estimateLines = lines.json?.data ?? [];
  record('List estimate lines', lines.ok && estimateLines.length > 0, lines.ms, `count=${estimateLines.length}`);

  const installTargetLine =
    estimateLines.find((line) => /grab bar|b-6806/i.test(String(line.description || ''))) ??
    estimateLines.find((line) => /blocking_unknown|Auto-price labor blocked/i.test(String(line.notes || ''))) ??
    estimateLines[0];
  const firstLineId = estimateLines[0]?.id;
  if (firstLineId) {
    const hide = await api('PUT', `/api/v1/takeoff/lines/${firstLineId}`, {
      proposalVisibility: 'internal_only',
    });
    record('Hide line from proposal (API)', hide.ok, hide.ms);
  }

  const proposal = await api('GET', `/api/v1/pipeline/projects/${projectId}/proposal-preview`);
  const proposalText = proposal.text;
  const hiddenOk =
    proposal.ok &&
    !proposalText.includes('blocking_unknown') &&
    !proposalText.includes('internal_only');
  record('Proposal preview (no raw flags)', hiddenOk, proposal.ms);

  const installLineId = installTargetLine?.id;
  if (installLineId) {
    const installAssump = await api<{ data: { laborMinutes?: number; notes?: string } }>(
      'POST',
      `/api/v1/takeoff/lines/${installLineId}/install-assumptions`,
      {
        lineAssumptions: { blocking_status: 'included' },
        recalculateLabor: true,
      }
    );
    const laborMinutes = Number(installAssump.json?.data?.laborMinutes ?? 0);
    const notes = String(installAssump.json?.data?.notes || '');
    const parsedAssumptions = notes.match(/blocking_status=included/i);
    record(
      'Install assumptions apply (sheets)',
      installAssump.ok && !notes.includes('blocking_unknown') && (laborMinutes > 0 || Boolean(parsedAssumptions)),
      installAssump.ms,
      installAssump.ok ? `laborMinutes=${laborMinutes}` : installAssump.text
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== Summary: ${passed} pass, ${failed} fail ===\n`);
  const outPath = path.join(root, 'docs', 'mvp-smoke-api-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  console.log(`Wrote ${outPath}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
