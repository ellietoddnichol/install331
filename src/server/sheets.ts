
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { randomUUID } from 'crypto';
import { getEstimatorDb } from './db/connection.ts';
import { CatalogItem } from '../types.ts';

export async function syncCatalogFromSheets() {
  const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
  const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    throw new Error('Missing Google Sheets credentials in environment variables.');
  }

  const auth = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Catalog!A2:P', // Assuming 'Catalog' sheet and headers in row 1
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return { message: 'No data found in the spreadsheet.' };
    }

    // Clear existing active items or mark them for update
    // For simplicity, we'll upsert based on SKU
    const upsertStmt = getEstimatorDb().prepare(`
      INSERT INTO catalog_items (id, sku, category, subcategory, family, description, manufacturer, brand, model, model_number, series, image_url, uom, base_material_cost, base_labor_minutes, labor_unit_type, taxable, ada_flag, tags, notes, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(sku) DO UPDATE SET
        category = excluded.category,
        subcategory = excluded.subcategory,
        family = excluded.family,
        description = excluded.description,
        manufacturer = excluded.manufacturer,
        brand = excluded.brand,
        model = excluded.model,
        model_number = excluded.model_number,
        series = excluded.series,
        image_url = excluded.image_url,
        uom = excluded.uom,
        base_material_cost = excluded.base_material_cost,
        base_labor_minutes = excluded.base_labor_minutes,
        labor_unit_type = excluded.labor_unit_type,
        taxable = excluded.taxable,
        ada_flag = excluded.ada_flag,
        tags = excluded.tags,
        notes = excluded.notes,
        active = 1
    `);

    let count = 0;
    const transaction = getEstimatorDb().transaction((items) => {
      for (const item of items) {
        upsertStmt.run(
          item.id, item.sku, item.category, item.subcategory, item.family, item.description,
          item.manufacturer, item.brand ?? null, item.model, item.modelNumber ?? null, item.series ?? null, item.imageUrl ?? null, item.uom, item.baseMaterialCost, item.baseLaborMinutes,
          item.laborUnitType, item.taxable, item.adaFlag, item.tags, item.notes
        );
        count++;
      }
    });

    const itemsToSync = rows.map(row => ({
      id: randomUUID(),
      sku: row[0],
      category: row[1],
      subcategory: row[2],
      family: row[3],
      description: row[4],
      manufacturer: row[5],
      model: row[6],
      uom: row[7],
      baseMaterialCost: parseFloat(row[8]) || 0,
      baseLaborMinutes: parseFloat(row[9]) || 0,
      laborUnitType: row[10],
      taxable: row[11] === 'TRUE' || row[11] === '1' ? 1 : 0,
      adaFlag: row[12] === 'TRUE' || row[12] === '1' ? 1 : 0,
      tags: JSON.stringify(row[13] ? row[13].split(',') : []),
      notes: row[14]
    }));

    transaction(itemsToSync);

    // Sync Bundles
    const bundlesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Bundles!A2:C',
    });
    const bundleRows = bundlesResponse.data.values;
    if (bundleRows && bundleRows.length > 0) {
      getEstimatorDb().prepare('DELETE FROM global_bundles').run();
      const insertBundle = getEstimatorDb().prepare('INSERT INTO global_bundles (id, name, items) VALUES (?, ?, ?)');
      bundleRows.forEach(row => {
        const id = row[0] || randomUUID();
        const name = row[1];
        const items = JSON.parse(row[2] || '[]');
        insertBundle.run(id, name, JSON.stringify(items));
      });
    }

    // Sync AddIns
    const addinsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'AddIns!A2:C',
    });
    const addinRows = addinsResponse.data.values;
    if (addinRows && addinRows.length > 0) {
      getEstimatorDb().prepare('DELETE FROM global_addins').run();
      const insertAddin = getEstimatorDb().prepare('INSERT INTO global_addins (id, name, cost, labor_minutes) VALUES (?, ?, ?, ?)');
      addinRows.forEach(row => {
        const id = randomUUID();
        const name = row[0];
        const cost = parseFloat(row[1]) || 0;
        const laborMins = parseFloat(row[2]) || 0;
        insertAddin.run(id, name, cost, laborMins);
      });
    }

    return { message: `Successfully synced ${count} items, ${bundleRows?.length || 0} bundles, and ${addinRows?.length || 0} add-ins from Google Sheets.` };
  } catch (error: unknown) {
    console.error('Google Sheets Sync Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Google Sheets Sync failed: ${message}`);
  }
}
