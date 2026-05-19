/**
 * QA audit probes — no secrets in stdout. Run: npx tsx scripts/qa-audit-probes.ts
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

function configured(name: string): boolean {
  return Boolean(String(process.env[name] || '').trim());
}

function envAudit() {
  const mustBe = {
    DATA_BACKEND: 'sheets',
    CATALOG_BACKEND: 'sheet',
    DB_DRIVER: 'sqlite',
    PROJECT_FILES_STORAGE: 'gcs',
    DIV10_BRAIN_ENABLED: '0',
  } as const;
  const mustNot = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'DIRECT_URL',
  ] as const;
  const workbookIds = [
    'PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID',
    'VENDOR_INTAKE_BACKEND_SPREADSHEET_ID',
    'CATALOG_LABOR_BACKEND_SPREADSHEET_ID',
    'DIV10_INSTALL_INTELLIGENCE_SPREADSHEET_ID',
  ] as const;
  const googleCreds = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    'GOOGLE_SERVICE_ACCOUNT_FILE',
    'GOOGLE_SERVICE_ACCOUNT',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ] as const;

  const checks: Record<string, { configured: boolean; value?: string; pass?: boolean }> = {};
  for (const [k, expected] of Object.entries(mustBe)) {
    const v = String(process.env[k] || '').trim();
    checks[k] = { configured: Boolean(v), value: v ? '(set)' : undefined, pass: v.toLowerCase() === expected };
  }
  for (const k of mustNot) {
    checks[k] = { configured: configured(k), pass: !configured(k) };
  }
  checks.GCS_PROJECT_FILES_BUCKET = {
    configured: configured('GCS_PROJECT_FILES_BUCKET'),
    value: configured('GCS_PROJECT_FILES_BUCKET') ? '(set)' : undefined,
    pass: configured('GCS_PROJECT_FILES_BUCKET'),
  };
  for (const k of workbookIds) {
    checks[k] = { configured: configured(k), pass: configured(k) };
  }
  const googleOk = googleCreds.some((k) => configured(k));
  checks.GOOGLE_CREDENTIALS = { configured: googleOk, pass: googleOk };

  return { checks, googleOk };
}

async function gcsProbe(): Promise<{
  ok: boolean;
  bucket: string | null;
  uploadMs: number | null;
  downloadMs: number | null;
  deleteMs: number | null;
  error?: string;
}> {
  const bucket = process.env.GCS_PROJECT_FILES_BUCKET?.trim() || null;
  if (!bucket) return { ok: false, bucket: null, uploadMs: null, downloadMs: null, deleteMs: null, error: 'GCS_PROJECT_FILES_BUCKET not set' };
  try {
    const {
      uploadProjectFileToGcs,
      downloadProjectFileFromGcs,
      deleteProjectFileFromGcs,
    } = await import('../src/server/services/gcsProjectFilesStorage.ts');
    const objectName = `qa-test/${Date.now()}-probe.txt`;
    const buffer = Buffer.from('div10-qa-probe', 'utf8');
    const t0 = Date.now();
    await uploadProjectFileToGcs({ bucket, objectName, buffer, contentType: 'text/plain' });
    const uploadMs = Date.now() - t0;
    const t1 = Date.now();
    const downloaded = await downloadProjectFileFromGcs(bucket, objectName);
    const downloadMs = Date.now() - t1;
    const match = downloaded.toString('utf8') === 'div10-qa-probe';
    const t2 = Date.now();
    await deleteProjectFileFromGcs(bucket, objectName);
    const deleteMs = Date.now() - t2;
    return { ok: match, bucket, uploadMs, downloadMs, deleteMs, error: match ? undefined : 'Download content mismatch' };
  } catch (e) {
    return {
      ok: false,
      bucket,
      uploadMs: null,
      downloadMs: null,
      deleteMs: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function sheetsProbe() {
  const { validateDiv10SheetsBackendHealth } = await import('../src/server/services/sheets/div10SheetsValidationService.ts');
  return validateDiv10SheetsBackendHealth();
}

async function main() {
  const env = envAudit();
  const gcs = await gcsProbe();
  let sheets: Awaited<ReturnType<typeof sheetsProbe>> | { error: string } = { error: 'skipped' };
  try {
    sheets = await sheetsProbe();
  } catch (e) {
    sheets = { error: e instanceof Error ? e.message : String(e) } as { error: string };
  }
  console.log(JSON.stringify({ env, gcs, sheets }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
