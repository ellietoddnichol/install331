import test from 'node:test';
import assert from 'node:assert/strict';

test('buildCatalogSourcePayload reflects env (tabs, spreadsheet flag, clean-table note)', async () => {
  const keys = ['GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SHEETS_ID', 'CATALOG_ITEMS_TABLE', 'GOOGLE_SHEETS_TAB_ITEMS', 'DB_DRIVER'] as const;
  const snap: Partial<Record<(typeof keys)[number], string | undefined>> = {};
  for (const k of keys) snap[k] = process.env[k];

  try {
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_ID;
    process.env.CATALOG_ITEMS_TABLE = 'catalog_items_clean';
    process.env.GOOGLE_SHEETS_TAB_ITEMS = 'CLEAN_ITEMS';
    process.env.DB_DRIVER = 'sqlite';

    const { buildCatalogSourcePayload } = await import('./catalogSource.ts');
    const p = buildCatalogSourcePayload();

    assert.equal(p.dbDriver, 'sqlite');
    assert.equal(p.catalogItemsTable, 'catalog_items_clean');
    assert.equal(p.sheetsItemsTab, 'CLEAN_ITEMS');
    assert.equal(p.spreadsheetIdConfigured, false);
    assert.ok(p.notes.some((n) => /spreadsheet id/i.test(n)));
    assert.ok(p.notes.some((n) => /VIEW/i.test(n) && /catalog_items_clean/i.test(n)));
  } finally {
    for (const k of keys) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
