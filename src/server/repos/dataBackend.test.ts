import test from 'node:test';
import assert from 'node:assert/strict';

test('getProjectsSpreadsheetId prefers PROJECT_SETUP over GOOGLE_PROJECTS', async () => {
  const snap: Record<string, string | undefined> = {
    PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID: process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID,
    GOOGLE_PROJECTS_SPREADSHEET_ID: process.env.GOOGLE_PROJECTS_SPREADSHEET_ID,
  };
  try {
    process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID = 'canonical-proj';
    process.env.GOOGLE_PROJECTS_SPREADSHEET_ID = 'legacy-proj';
    const { getProjectsSpreadsheetId } = await import('./dataBackend.ts');
    assert.equal(getProjectsSpreadsheetId(), 'canonical-proj');
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('getSettingsSpreadsheetId prefers PROJECT_SETUP over GOOGLE_SETTINGS', async () => {
  const snap: Record<string, string | undefined> = {
    PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID: process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID,
    GOOGLE_SETTINGS_SPREADSHEET_ID: process.env.GOOGLE_SETTINGS_SPREADSHEET_ID,
    GOOGLE_PROJECTS_SPREADSHEET_ID: process.env.GOOGLE_PROJECTS_SPREADSHEET_ID,
  };
  try {
    process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID = 'settings-from-canonical';
    process.env.GOOGLE_SETTINGS_SPREADSHEET_ID = 'legacy-settings';
    process.env.GOOGLE_PROJECTS_SPREADSHEET_ID = 'legacy-projects';
    const { getSettingsSpreadsheetId } = await import('./dataBackend.ts');
    assert.equal(getSettingsSpreadsheetId(), 'settings-from-canonical');
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('getCatalogSpreadsheetId prefers CATALOG_LABOR over GOOGLE_CATALOG', async () => {
  const snap: Record<string, string | undefined> = {
    CATALOG_LABOR_BACKEND_SPREADSHEET_ID: process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID,
    GOOGLE_CATALOG_SPREADSHEET_ID: process.env.GOOGLE_CATALOG_SPREADSHEET_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
  };
  try {
    process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID = 'canonical-cat';
    process.env.GOOGLE_CATALOG_SPREADSHEET_ID = 'legacy-cat';
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_ID;
    const { getCatalogSpreadsheetId } = await import('./dataBackend.ts');
    assert.equal(getCatalogSpreadsheetId(), 'canonical-cat');
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('getVendorIntakeSpreadsheetIdForWorkspace error names VENDOR_INTAKE_BACKEND_SPREADSHEET_ID', async () => {
  const snap = process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID;
  try {
    delete process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID;
    const { getVendorIntakeSpreadsheetIdForWorkspace } = await import('./dataBackend.ts');
    assert.throws(
      () => getVendorIntakeSpreadsheetIdForWorkspace(),
      (err: unknown) => err instanceof Error && err.message.includes('VENDOR_INTAKE_BACKEND_SPREADSHEET_ID')
    );
  } finally {
    if (snap === undefined) delete process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID;
    else process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID = snap;
  }
});
