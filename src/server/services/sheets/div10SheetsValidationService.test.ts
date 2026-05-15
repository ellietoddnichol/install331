import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDiv10SheetsBackendHealth } from './div10SheetsValidationService.ts';

test('when DATA_BACKEND is not sheets (e.g. db or sqlite), health reports inactive and does not require workbook env', async () => {
  const snap: Record<string, string | undefined> = {
    DATA_BACKEND: process.env.DATA_BACKEND,
    PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID: process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID,
    VENDOR_INTAKE_BACKEND_SPREADSHEET_ID: process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID,
    CATALOG_LABOR_BACKEND_SPREADSHEET_ID: process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID,
  };
  try {
    process.env.DATA_BACKEND = 'db';
    delete process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID;
    delete process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID;
    delete process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_ID;
    const r = await validateDiv10SheetsBackendHealth();
    assert.equal(r.sheetsBackendActive, false);
    assert.equal(r.ok, true);
    assert.ok(r.message?.includes('not active'));
    assert.deepEqual(r.missingEnvVars, []);
    assert.deepEqual(r.workbooks, []);
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('when DATA_BACKEND is sheets, all three workbook ids are required (catalog allows legacy)', async () => {
  const snap: Record<string, string | undefined> = {
    DATA_BACKEND: process.env.DATA_BACKEND,
    PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID: process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID,
    VENDOR_INTAKE_BACKEND_SPREADSHEET_ID: process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID,
    CATALOG_LABOR_BACKEND_SPREADSHEET_ID: process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
    GOOGLE_PROJECTS_SPREADSHEET_ID: process.env.GOOGLE_PROJECTS_SPREADSHEET_ID,
    GOOGLE_CATALOG_SPREADSHEET_ID: process.env.GOOGLE_CATALOG_SPREADSHEET_ID,
    GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT,
  };
  try {
    process.env.DATA_BACKEND = 'sheets';
    delete process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID;
    delete process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID;
    delete process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_ID;
    delete process.env.GOOGLE_PROJECTS_SPREADSHEET_ID;
    delete process.env.GOOGLE_CATALOG_SPREADSHEET_ID;
    delete process.env.GOOGLE_SERVICE_ACCOUNT;
    const r = await validateDiv10SheetsBackendHealth();
    assert.equal(r.sheetsBackendActive, true);
    assert.equal(r.ok, false);
    assert.ok(r.missingEnvVars.includes('PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID'));
    assert.ok(r.missingEnvVars.includes('VENDOR_INTAKE_BACKEND_SPREADSHEET_ID'));
    assert.ok(
      r.missingEnvVars.some((s) => s.includes('CATALOG_LABOR_BACKEND_SPREADSHEET_ID')),
      `expected catalog env hint, got ${JSON.stringify(r.missingEnvVars)}`
    );
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('when DATA_BACKEND is sheets, legacy GOOGLE_PROJECTS and GOOGLE_SHEETS_ID satisfy project and catalog ids', async () => {
  const snap: Record<string, string | undefined> = {
    DATA_BACKEND: process.env.DATA_BACKEND,
    PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID: process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID,
    VENDOR_INTAKE_BACKEND_SPREADSHEET_ID: process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID,
    CATALOG_LABOR_BACKEND_SPREADSHEET_ID: process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
    GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT,
    GOOGLE_PROJECTS_SPREADSHEET_ID: process.env.GOOGLE_PROJECTS_SPREADSHEET_ID,
    GOOGLE_CATALOG_SPREADSHEET_ID: process.env.GOOGLE_CATALOG_SPREADSHEET_ID,
  };
  try {
    process.env.DATA_BACKEND = 'sheets';
    process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID = 'vendor-sheet-id';
    delete process.env.GOOGLE_SERVICE_ACCOUNT;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_CATALOG_SPREADSHEET_ID;
    process.env.GOOGLE_SHEETS_ID = 'legacy-catalog-id';
    delete process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID;
    process.env.GOOGLE_PROJECTS_SPREADSHEET_ID = 'legacy-project-id';
    const r = await validateDiv10SheetsBackendHealth();
    assert.ok(
      !r.missingEnvVars.some((s) => s.includes('CATALOG_LABOR')),
      `catalog should be satisfied by legacy id, got ${JSON.stringify(r.missingEnvVars)}`
    );
    assert.ok(
      !r.missingEnvVars.includes('PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID'),
      `project workbook should be satisfied by GOOGLE_PROJECTS, got ${JSON.stringify(r.missingEnvVars)}`
    );
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('when DATA_BACKEND is sheets, GOOGLE_CATALOG_SPREADSHEET_ID satisfies catalog workbook id', async () => {
  const snap: Record<string, string | undefined> = {
    DATA_BACKEND: process.env.DATA_BACKEND,
    PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID: process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID,
    VENDOR_INTAKE_BACKEND_SPREADSHEET_ID: process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID,
    CATALOG_LABOR_BACKEND_SPREADSHEET_ID: process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID,
    GOOGLE_CATALOG_SPREADSHEET_ID: process.env.GOOGLE_CATALOG_SPREADSHEET_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
    GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT,
  };
  try {
    process.env.DATA_BACKEND = 'sheets';
    process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID = 'proj';
    process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID = 'vendor';
    delete process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_ID;
    process.env.GOOGLE_CATALOG_SPREADSHEET_ID = 'catalog-via-google-catalog';
    delete process.env.GOOGLE_SERVICE_ACCOUNT;
    const r = await validateDiv10SheetsBackendHealth();
    assert.ok(
      !r.missingEnvVars.some((s) => s.includes('CATALOG_LABOR')),
      `expected GOOGLE_CATALOG to satisfy catalog, got ${JSON.stringify(r.missingEnvVars)}`
    );
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('when DATA_BACKEND is sheets, health workbooks use canonical logical keys and masked ids', async () => {
  const snap: Record<string, string | undefined> = {
    DATA_BACKEND: process.env.DATA_BACKEND,
    PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID: process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID,
    VENDOR_INTAKE_BACKEND_SPREADSHEET_ID: process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID,
    CATALOG_LABOR_BACKEND_SPREADSHEET_ID: process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID,
    GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT,
  };
  try {
    process.env.DATA_BACKEND = 'sheets';
    process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID = 'abcdefghijklmnop';
    process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID = 'qrstuvwxyz123456';
    process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID = '0123456789ABCDEF';
    delete process.env.GOOGLE_SERVICE_ACCOUNT;
    const r = await validateDiv10SheetsBackendHealth();
    assert.equal(r.workbooks.length, 3);
    const keys = r.workbooks.map((w) => w.key).sort();
    assert.deepEqual(keys, ['catalogLaborBackend', 'projectSetupEstimateProposal', 'vendorIntakeBackend']);
    for (const w of r.workbooks) {
      assert.ok(!w.spreadsheetIdMasked.includes('abcdefghijklmnop'));
      assert.ok(w.spreadsheetIdMasked.startsWith('********') || w.spreadsheetIdMasked === '(unset)');
    }
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
