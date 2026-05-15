#!/usr/bin/env node
/**
 * Verify and seed Div 10 Google Sheets workbooks (three separate spreadsheet IDs).
 *
 * Usage:
 *   node scripts/seed-div10-sheets-workbooks.mjs --dry-run
 *   node scripts/seed-div10-sheets-workbooks.mjs
 *
 * Requires env (from .env.local):
 *   PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID
 *   VENDOR_INTAKE_BACKEND_SPREADSHEET_ID
 *   CATALOG_LABOR_BACKEND_SPREADSHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (or GOOGLE_SERVICE_ACCOUNT / file)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import {
  ALL_DIV10_WORKBOOKS,
  DIV10_HEADER_ROW_1_BASED,
  STRUCTURAL_TAB_NAMES,
} from './seed-div10-sheets-spec.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

for (const fileName of ['.env', '.env.local']) {
  const fullPath = path.join(repoRoot, fileName);
  if (fs.existsSync(fullPath)) dotenv.config({ path: fullPath, override: false });
}

const SHEETS_SCOPE = ['https://www.googleapis.com/auth/spreadsheets'];
const dryRun = process.argv.includes('--dry-run');

function logWorkbook(title) {
  console.log(`\n=== ${title} ===`);
}

function logAction(msg) {
  console.log(`  ${msg}`);
}

function escapeSheetTabForRange(tabName) {
  const t = String(tabName || '').trim();
  if (!t) return "''";
  return `'${t.replace(/'/g, "''")}'`;
}

function columnIndexToA1Letter(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function normalizeHeaderLabel(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function compactHeaderToken(raw) {
  return normalizeHeaderLabel(raw).replace(/\s+/g, '');
}

function buildHeaderIndex(headerRow) {
  const m = new Map();
  headerRow.forEach((h, i) => {
    const key = compactHeaderToken(h);
    if (key && !m.has(key)) m.set(key, i);
  });
  return m;
}

function findHeaderRowIndex(values, expectedHeaders) {
  const expected = new Set(expectedHeaders.map((h) => compactHeaderToken(h)));
  const limit = Math.min(values.length, 25);
  for (let i = 0; i < limit; i++) {
    const row = values[i] || [];
    const compact = row.map((c) => compactHeaderToken(c)).filter(Boolean);
    const hits = compact.filter((t) => expected.has(t)).length;
    if (hits >= Math.min(2, expected.size)) return i;
  }
  return DIV10_HEADER_ROW_1_BASED - 1;
}

function headersSatisfied(headerRow, expectedHeaders) {
  const idx = buildHeaderIndex(headerRow);
  return expectedHeaders.every((h) => idx.has(compactHeaderToken(h)));
}

function rowHasAnyData(cells) {
  return (cells || []).some((c) => String(c ?? '').trim().length > 0);
}

function dataRowsAfterHeader(values, headerRowIndex) {
  const body = values.slice(headerRowIndex + 1);
  return body.filter((row) => rowHasAnyData(row));
}

function buildGoogleAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT?.trim();
  if (json?.startsWith('{')) {
    const parsed = JSON.parse(json);
    return new JWT({
      email: parsed.client_email,
      key: parsed.private_key,
      scopes: SHEETS_SCOPE,
    });
  }
  const file =
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (file && fs.existsSync(file)) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new JWT({
      email: parsed.client_email,
      key: parsed.private_key,
      scopes: SHEETS_SCOPE,
    });
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  key = String(key).replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error(
      'Google Sheets credentials missing. Set GOOGLE_SERVICE_ACCOUNT (JSON), GOOGLE_SERVICE_ACCOUNT_FILE, or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
    );
  }
  return new JWT({ email, key, scopes: SHEETS_SCOPE });
}

function friendlySheetsError(err, spreadsheetId, workbookLabel) {
  const status = err?.code || err?.response?.status;
  const msg = err?.message || String(err);
  if (status === 403 || /permission|forbidden/i.test(msg)) {
    return new Error(
      `${workbookLabel}: Google returned 403 (permission denied) for spreadsheet ${spreadsheetId}.\n` +
        `Share the workbook with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || 'your service account'} as Editor.\n` +
        `Original: ${msg}`
    );
  }
  if (status === 404 || /not found/i.test(msg)) {
    return new Error(
      `${workbookLabel}: spreadsheet not found (${spreadsheetId}). Confirm the env var matches the browser URL /d/THIS_PART/edit.\nOriginal: ${msg}`
    );
  }
  return err;
}

function resolveSpreadsheetId(workbook) {
  const id = String(process.env[workbook.envVar] || '').trim();
  if (!id) {
    throw new Error(
      `Missing ${workbook.envVar} for ${workbook.label}. Set all three canonical workbook IDs (do not use GOOGLE_SHEETS_SPREADSHEET_ID).`
    );
  }
  return id;
}

async function listTabTitles(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  return new Set(
    (res.data.sheets || [])
      .map((s) => String(s.properties?.title || '').trim())
      .filter(Boolean)
  );
}

async function readTabMatrix(sheets, spreadsheetId, tabName) {
  const range = `${escapeSheetTabForRange(tabName)}!A:ZZ`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values || []).map((row) => row.map((c) => String(c ?? '')));
}

async function writeRange(sheets, spreadsheetId, tabName, row1Based, values) {
  const lastCol = columnIndexToA1Letter(Math.max(0, (values[0]?.length || 1) - 1));
  const range = `${escapeSheetTabForRange(tabName)}!A${row1Based}:${lastCol}${row1Based + values.length - 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

async function appendRows(sheets, spreadsheetId, tabName, rows) {
  if (!rows.length) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${escapeSheetTabForRange(tabName)}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

async function createTab(sheets, spreadsheetId, tabName) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    },
  });
}

async function ensureStructuralTab(sheets, spreadsheetId, tabName, dryRunMode, stats) {
  const titles = await listTabTitles(sheets, spreadsheetId);
  if (!titles.has(tabName)) {
    stats.createdTabs += 1;
    logAction(dryRunMode ? `[dry-run] would create structural tab "${tabName}"` : `created structural tab "${tabName}"`);
    if (!dryRunMode) await createTab(sheets, spreadsheetId, tabName);
    if (!dryRunMode) {
      await writeRange(sheets, spreadsheetId, tabName, 1, [
        [tabName],
        ['Reference / notes only — do not use ids in this tab for API routing.'],
        [],
      ]);
    }
    return;
  }
  stats.existingTabs += 1;
  logAction(`structural tab "${tabName}" already exists`);
}

async function ensureDataTab(sheets, spreadsheetId, tabSpec, dryRunMode, stats) {
  const { name: tabName, headers, starterRows } = tabSpec;
  const titles = await listTabTitles(sheets, spreadsheetId);
  let matrix = [];

  if (!titles.has(tabName)) {
    stats.createdTabs += 1;
    logAction(dryRunMode ? `[dry-run] would create tab "${tabName}"` : `created tab "${tabName}"`);
    if (!dryRunMode) {
      await createTab(sheets, spreadsheetId, tabName);
      matrix = [];
    }
  } else {
    stats.existingTabs += 1;
    if (!dryRunMode) matrix = await readTabMatrix(sheets, spreadsheetId, tabName);
    else logAction(`tab "${tabName}" already exists`);
  }

  const prelude = [
    [tabName],
    ['Div 10 — column headers are on row 4; do not rename header labels.'],
    [],
  ];
  const headerRow = [...headers];

  let headerRowIndex = matrix.length ? findHeaderRowIndex(matrix, headers) : DIV10_HEADER_ROW_1_BASED - 1;
  const currentHeader = matrix[headerRowIndex] || [];
  const needsHeader =
    !matrix.length || !headersSatisfied(currentHeader, headers);

  if (needsHeader) {
    stats.repairedHeaders += 1;
    logAction(
      dryRunMode
        ? `[dry-run] would write header row (${headers.length} columns) on "${tabName}" row ${DIV10_HEADER_ROW_1_BASED}`
        : `wrote header row on "${tabName}" row ${DIV10_HEADER_ROW_1_BASED}`
    );
    if (!dryRunMode) {
      if (matrix.length < DIV10_HEADER_ROW_1_BASED) {
        await writeRange(sheets, spreadsheetId, tabName, 1, prelude);
      }
      await writeRange(sheets, spreadsheetId, tabName, DIV10_HEADER_ROW_1_BASED, [headerRow]);
      matrix = await readTabMatrix(sheets, spreadsheetId, tabName);
      headerRowIndex = findHeaderRowIndex(matrix, headers);
    }
  } else {
    stats.okHeaders += 1;
    logAction(`headers OK on "${tabName}"`);
  }

  const starter =
    typeof starterRows === 'function' ? starterRows(new Date().toISOString()) : starterRows || [];
  if (!starter.length) return;

  if (!dryRunMode) {
    matrix = matrix.length ? matrix : await readTabMatrix(sheets, spreadsheetId, tabName);
    headerRowIndex = findHeaderRowIndex(matrix, headers);
  }

  const existingData = dryRunMode ? [] : dataRowsAfterHeader(matrix, headerRowIndex);
  if (existingData.length > 0) {
    logAction(`skipped starter rows on "${tabName}" (${existingData.length} data row(s) present)`);
    return;
  }

  stats.starterRows += starter.length;
  logAction(
    dryRunMode
      ? `[dry-run] would append ${starter.length} starter row(s) to "${tabName}"`
      : `appended ${starter.length} starter row(s) to "${tabName}"`
  );
  if (!dryRunMode) await appendRows(sheets, spreadsheetId, tabName, starter);
}

async function seedWorkbook(sheets, workbook, dryRunMode) {
  const spreadsheetId = resolveSpreadsheetId(workbook);
  logWorkbook(`${workbook.label} (${workbook.envVar}=${spreadsheetId})`);

  const stats = {
    createdTabs: 0,
    existingTabs: 0,
    repairedHeaders: 0,
    okHeaders: 0,
    starterRows: 0,
  };

  try {
    for (const structural of STRUCTURAL_TAB_NAMES) {
      await ensureStructuralTab(sheets, spreadsheetId, structural, dryRunMode, stats);
    }
    for (const tab of workbook.tabs) {
      await ensureDataTab(sheets, spreadsheetId, tab, dryRunMode, stats);
    }
  } catch (err) {
    throw friendlySheetsError(err, spreadsheetId, workbook.label);
  }

  logAction(
    `summary: +${stats.createdTabs} tab(s), ${stats.okHeaders} header(s) OK, ${stats.repairedHeaders} header repair(s), ${stats.starterRows} starter row(s)`
  );
  return stats;
}

async function main() {
  console.log(dryRun ? 'Div 10 Sheets seed — DRY RUN' : 'Div 10 Sheets seed — APPLY');
  console.log('Workbooks: project / vendor intake / catalog labor (three separate IDs)\n');

  const auth = buildGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const totals = { createdTabs: 0, repairedHeaders: 0, starterRows: 0 };
  for (const workbook of ALL_DIV10_WORKBOOKS) {
    const s = await seedWorkbook(sheets, workbook, dryRun);
    totals.createdTabs += s.createdTabs;
    totals.repairedHeaders += s.repairedHeaders;
    totals.starterRows += s.starterRows;
  }

  console.log('\n=== Done ===');
  console.log(
    dryRun
      ? `Dry run complete. Would create ${totals.createdTabs} tab(s), repair ${totals.repairedHeaders} header row(s), seed ${totals.starterRows} starter row(s).`
      : `Applied. Created ${totals.createdTabs} tab(s), repaired ${totals.repairedHeaders} header row(s), seeded ${totals.starterRows} starter row(s).`
  );
  if (dryRun) {
    console.log('Run without --dry-run to apply: npm run seed:div10-sheets');
  }
}

main().catch((err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
