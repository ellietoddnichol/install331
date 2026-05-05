import test from 'node:test';
import assert from 'node:assert/strict';

test('buildCatalogSourcePayload reflects env (tabs, spreadsheet flag, clean-table note)', async () => {
  const keys = [
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_SHEETS_ID',
    'CATALOG_ITEMS_TABLE',
    'GOOGLE_SHEETS_TAB_ITEMS',
    'GOOGLE_SHEETS_TAB_MODIFIERS',
    'GOOGLE_SHEETS_TAB_CLEAN_MODIFIERS',
    'DB_DRIVER',
    'CATALOG_SOURCE',
    'CATALOG_BACKEND',
  ] as const;
  const snap: Partial<Record<(typeof keys)[number], string | undefined>> = {};
  for (const k of keys) snap[k] = process.env[k];

  try {
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_ID;
    delete process.env.CATALOG_SOURCE;
    delete process.env.CATALOG_BACKEND;
    delete process.env.GOOGLE_SHEETS_TAB_MODIFIERS;
    delete process.env.GOOGLE_SHEETS_TAB_CLEAN_MODIFIERS;
    process.env.CATALOG_ITEMS_TABLE = 'catalog_items_clean';
    process.env.GOOGLE_SHEETS_TAB_ITEMS = 'CLEAN_ITEMS';
    process.env.DB_DRIVER = 'sqlite';

    const { buildCatalogSourcePayload } = await import('./catalogSource.ts');
    const p = buildCatalogSourcePayload();

    assert.equal(p.dbDriver, 'sqlite');
    assert.equal(p.catalogSource, 'sqlite');
    assert.equal(p.catalogItemsTable, 'catalog_items_clean');
    assert.equal(p.sheetsItemsTab, 'CLEAN_ITEMS');
    assert.equal(p.sheetsModifiersTab, 'CLEAN_MODIFIERS');
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

test('legacy GOOGLE_SHEETS_TAB_MODIFIERS=MODIFIERS resolves read tab to CLEAN_MODIFIERS', async () => {
  const keys = ['GOOGLE_SHEETS_TAB_MODIFIERS', 'CATALOG_BACKEND', 'CATALOG_SOURCE', 'DB_DRIVER'] as const;
  const snap: Partial<Record<(typeof keys)[number], string | undefined>> = {};
  for (const k of keys) snap[k] = process.env[k];
  try {
    process.env.DB_DRIVER = 'sqlite';
    delete process.env.CATALOG_BACKEND;
    delete process.env.CATALOG_SOURCE;
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'abc';
    process.env.GOOGLE_SHEETS_TAB_MODIFIERS = 'MODIFIERS';
    delete process.env.CATALOG_SYNC_ALLOW_LEGACY_MODIFIERS_TAB;

    const { buildCatalogSourcePayload } = await import('./catalogSource.ts');
    const p = buildCatalogSourcePayload();

    assert.equal(p.sheetsModifiersTab, 'CLEAN_MODIFIERS');
    assert.ok(p.notes.some((n) => /modifier upserts read tab "CLEAN_MODIFIERS"/i.test(n)));
  } finally {
    for (const k of keys) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  }
});
