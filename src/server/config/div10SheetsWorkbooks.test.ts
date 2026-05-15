import test from 'node:test';
import assert from 'node:assert/strict';

test('getCatalogLaborSpreadsheetId prefers CATALOG_LABOR_BACKEND_SPREADSHEET_ID', async () => {
  const keys = [
    'CATALOG_LABOR_BACKEND_SPREADSHEET_ID',
    'GOOGLE_CATALOG_SPREADSHEET_ID',
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_SHEETS_ID',
  ] as const;
  const snap: Partial<Record<(typeof keys)[number], string | undefined>> = {};
  for (const k of keys) snap[k] = process.env[k];
  try {
    process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID = 'catalog-wb';
    process.env.GOOGLE_CATALOG_SPREADSHEET_ID = 'google-catalog';
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'legacy-wb';
    delete process.env.GOOGLE_SHEETS_ID;
    const { getCatalogLaborSpreadsheetId } = await import('./div10SheetsWorkbooks.ts');
    assert.equal(getCatalogLaborSpreadsheetId(), 'catalog-wb');
  } finally {
    for (const k of keys) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('getCatalogLaborSpreadsheetId falls back to GOOGLE_SHEETS_SPREADSHEET_ID', async () => {
  const keys = [
    'CATALOG_LABOR_BACKEND_SPREADSHEET_ID',
    'GOOGLE_CATALOG_SPREADSHEET_ID',
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_SHEETS_ID',
  ] as const;
  const snap: Partial<Record<(typeof keys)[number], string | undefined>> = {};
  for (const k of keys) snap[k] = process.env[k];
  try {
    delete process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID;
    delete process.env.GOOGLE_CATALOG_SPREADSHEET_ID;
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'only-legacy';
    delete process.env.GOOGLE_SHEETS_ID;
    const { getCatalogLaborSpreadsheetId } = await import('./div10SheetsWorkbooks.ts');
    assert.equal(getCatalogLaborSpreadsheetId(), 'only-legacy');
  } finally {
    for (const k of keys) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('getCatalogLaborSpreadsheetId prefers GOOGLE_CATALOG over GOOGLE_SHEETS_SPREADSHEET_ID', async () => {
  const keys = [
    'CATALOG_LABOR_BACKEND_SPREADSHEET_ID',
    'GOOGLE_CATALOG_SPREADSHEET_ID',
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_SHEETS_ID',
  ] as const;
  const snap: Partial<Record<(typeof keys)[number], string | undefined>> = {};
  for (const k of keys) snap[k] = process.env[k];
  try {
    delete process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID;
    process.env.GOOGLE_CATALOG_SPREADSHEET_ID = 'via-google-catalog';
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'via-sheets-id';
    delete process.env.GOOGLE_SHEETS_ID;
    const { getCatalogLaborSpreadsheetId } = await import('./div10SheetsWorkbooks.ts');
    assert.equal(getCatalogLaborSpreadsheetId(), 'via-google-catalog');
  } finally {
    for (const k of keys) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('getProjectSetupSpreadsheetId prefers canonical over GOOGLE_PROJECTS', async () => {
  const keys = ['PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID', 'GOOGLE_PROJECTS_SPREADSHEET_ID'] as const;
  const snap: Partial<Record<(typeof keys)[number], string | undefined>> = {};
  for (const k of keys) snap[k] = process.env[k];
  try {
    process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID = 'canon-p';
    process.env.GOOGLE_PROJECTS_SPREADSHEET_ID = 'legacy-p';
    const { getProjectSetupSpreadsheetId } = await import('./div10SheetsWorkbooks.ts');
    assert.equal(getProjectSetupSpreadsheetId(), 'canon-p');
  } finally {
    for (const k of keys) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('catalogLaborTabCatalogItems defaults to CatalogItems', async () => {
  const key = 'GOOGLE_SHEETS_TAB_CATALOG_ITEMS' as const;
  const prev = process.env[key];
  try {
    delete process.env[key];
    const { catalogLaborTabCatalogItems } = await import('./div10SheetsWorkbooks.ts');
    assert.equal(catalogLaborTabCatalogItems(), 'CatalogItems');
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

test('projectSetupTabEstimateLines defaults to EstimateLines', async () => {
  const key = 'GOOGLE_SHEETS_TAB_ESTIMATE_LINES' as const;
  const prev = process.env[key];
  try {
    delete process.env[key];
    const { projectSetupTabEstimateLines } = await import('./div10SheetsWorkbooks.ts');
    assert.equal(projectSetupTabEstimateLines(), 'EstimateLines');
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

test('catalogLaborTabCatalogItems honors GOOGLE_SHEETS_TAB_CATALOG_ITEMS', async () => {
  const key = 'GOOGLE_SHEETS_TAB_CATALOG_ITEMS' as const;
  const prev = process.env[key];
  try {
    process.env[key] = 'CATALOG_ITEMS';
    const { catalogLaborTabCatalogItems } = await import('./div10SheetsWorkbooks.ts');
    assert.equal(catalogLaborTabCatalogItems(), 'CATALOG_ITEMS');
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});
