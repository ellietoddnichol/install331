import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { estimatorDb } from '../db/connection.ts';

interface SyncCounts {
  itemsSynced: number;
  modifiersSynced: number;
  bundlesSynced: number;
  bundleItemsSynced: number;
}

export interface CatalogSyncResult extends SyncCounts {
  message: string;
  spreadsheetId: string;
  tabs: {
    items: string;
    modifiers: string;
    bundles: string;
  };
  warnings: string[];
  syncedAt: string;
}

interface SpreadsheetConfig {
  spreadsheetId: string;
  itemsTab: string;
  modifiersTab: string;
  bundlesTab: string;
}

function normalizeHeader(input: string): string {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseBoolean(input: unknown, defaultValue = true): boolean {
  const value = String(input ?? '').trim().toLowerCase();
  if (!value) return defaultValue;
  if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(value)) return true;
  if (['false', '0', 'no', 'n', 'inactive', 'disabled'].includes(value)) return false;
  return defaultValue;
}

function parseNumber(input: unknown, defaultValue = 0): number {
  const parsed = Number(String(input ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function unitLaborCostFromMinutes(laborMinutes: number): number {
  const hourlyRate = Number(process.env.DEFAULT_LABOR_RATE_PER_HOUR || 30);
  if (!Number.isFinite(laborMinutes) || laborMinutes <= 0) return 0;
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return 0;
  return Number(((laborMinutes / 60) * hourlyRate).toFixed(2));
}

function splitList(input: unknown): string[] {
  const value = String(input ?? '').trim();
  if (!value) return [];
  return value
    .split(/[,;|\n]/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeSkuToken(input: unknown): string {
  return String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeModifierToken(input: unknown): string {
  return String(input ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function canonicalKey(input: unknown): string {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function columnIndex(headers: string[], aliases: string[]): number | null {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (!header) continue;
    if (aliases.some((alias) => header === alias || header.includes(alias))) {
      return i;
    }
  }
  return null;
}

function getCell(row: string[], index: number | null): string {
  if (index === null) return '';
  return String(row[index] ?? '').trim();
}

function keyFromParts(...parts: string[]): string {
  const joined = parts.map((part) => part.trim().toLowerCase()).filter(Boolean).join('|');
  return createHash('sha1').update(joined || randomUUID()).digest('hex').slice(0, 20);
}

function updateSyncStatus(params: {
  status: 'running' | 'success' | 'failed';
  message: string | null;
  counts?: SyncCounts;
  warnings?: string[];
}) {
  const now = new Date().toISOString();
  const current = estimatorDb.prepare('SELECT * FROM catalog_sync_status_v1 WHERE id = ?').get('catalog') as any;
  const counts = params.counts || {
    itemsSynced: current?.items_synced || 0,
    modifiersSynced: current?.modifiers_synced || 0,
    bundlesSynced: current?.bundles_synced || 0,
    bundleItemsSynced: current?.bundle_items_synced || 0,
  };

  estimatorDb.prepare(`
    UPDATE catalog_sync_status_v1
    SET
      last_attempt_at = ?,
      last_success_at = CASE WHEN ? = 'success' THEN ? ELSE last_success_at END,
      status = ?,
      message = ?,
      items_synced = ?,
      modifiers_synced = ?,
      bundles_synced = ?,
      bundle_items_synced = ?,
      warnings_json = ?
    WHERE id = 'catalog'
  `).run(
    now,
    params.status,
    now,
    params.status,
    params.message,
    counts.itemsSynced,
    counts.modifiersSynced,
    counts.bundlesSynced,
    counts.bundleItemsSynced,
    JSON.stringify(params.warnings || [])
  );
}

function insertSyncRun(params: {
  status: 'success' | 'failed';
  message: string | null;
  counts: SyncCounts;
  warnings: string[];
}) {
  estimatorDb.prepare(`
    INSERT INTO catalog_sync_runs_v1 (
      id, attempted_at, status, message, items_synced, modifiers_synced, bundles_synced, bundle_items_synced, warnings_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    new Date().toISOString(),
    params.status,
    params.message,
    params.counts.itemsSynced,
    params.counts.modifiersSynced,
    params.counts.bundlesSynced,
    params.counts.bundleItemsSynced,
    JSON.stringify(params.warnings || [])
  );
}

function buildAuth(): JWT {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
  const serviceAccountFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    return new JWT({
      email: parsed.client_email,
      key: String(parsed.private_key || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  if (serviceAccountFile) {
    const parsed = JSON.parse(fs.readFileSync(serviceAccountFile, 'utf8'));
    return new JWT({
      email: parsed.client_email,
      key: String(parsed.private_key || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    const diagnostics = [
      `GOOGLE_SERVICE_ACCOUNT=${serviceAccountJson ? 'set' : 'missing'}`,
      `GOOGLE_SERVICE_ACCOUNT_FILE=${serviceAccountFile ? 'set' : 'missing'}`,
      `GOOGLE_SERVICE_ACCOUNT_EMAIL=${clientEmail ? 'set' : 'missing'}`,
      `GOOGLE_PRIVATE_KEY=${privateKey ? 'set' : 'missing'}`,
    ].join(', ');
    throw new Error(`Missing Google Sheets credentials. Set GOOGLE_SERVICE_ACCOUNT JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY. (${diagnostics})`);
  }

  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSpreadsheetConfig(): SpreadsheetConfig {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '1QWCGCssWtAQ8Pjx9_-7LDs4lraRbptURd8D04bNvnEg';
  const itemsTab = process.env.GOOGLE_SHEETS_TAB_ITEMS || 'ITEMS';
  const modifiersTab = process.env.GOOGLE_SHEETS_TAB_MODIFIERS || 'MODIFIERS';
  const bundlesTab = process.env.GOOGLE_SHEETS_TAB_BUNDLES || 'BUNDLES';

  if (!spreadsheetId) {
    throw new Error('Missing spreadsheet ID. Set GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_SHEETS_ID.');
  }

  return { spreadsheetId, itemsTab, modifiersTab, bundlesTab };
}

function toA1Column(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

async function upsertRowInSheet(params: {
  spreadsheetId: string;
  tabName: string;
  keyAliases: string[];
  keyValue: string;
  setters: Array<{ aliases: string[]; value: string }>;
}): Promise<void> {
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: params.spreadsheetId,
    range: `${params.tabName}!A:ZZ`,
  });

  const values = validateSheetRows((response.data.values || []) as string[][], params.tabName);
  const headersRaw = values[0].map((value) => String(value ?? '').trim());
  const headers = headersRaw.map(normalizeHeader);
  const keyCol = columnIndex(headers, params.keyAliases.map(normalizeHeader));
  if (keyCol === null) {
    throw new Error(`${params.tabName} tab is missing key header for ${params.keyAliases.join(', ')}.`);
  }

  const targetRowIndex = values.findIndex((row, index) => {
    if (index === 0) return false;
    return String(row[keyCol] || '').trim().toLowerCase() === params.keyValue.trim().toLowerCase();
  });

  const baseRow = targetRowIndex > 0 ? values[targetRowIndex] : [];
  const output = headersRaw.map((_header, index) => String(baseRow[index] ?? ''));

  const setByAliases = (aliases: string[], value: string) => {
    const idx = columnIndex(headers, aliases.map(normalizeHeader));
    if (idx !== null) output[idx] = value;
  };

  setByAliases(params.keyAliases, params.keyValue);
  params.setters.forEach((setter) => setByAliases(setter.aliases, setter.value));

  if (targetRowIndex > 0) {
    const rowNumber = targetRowIndex + 1;
    const lastCol = toA1Column(Math.max(output.length - 1, 0));
    await sheets.spreadsheets.values.update({
      spreadsheetId: params.spreadsheetId,
      range: `${params.tabName}!A${rowNumber}:${lastCol}${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [output] },
    });
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: params.spreadsheetId,
    range: `${params.tabName}!A:ZZ`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [output] },
  });
}

export async function upsertItemInGoogleSheet(input: {
  sku: string;
  category: string;
  manufacturer?: string | null;
  model?: string | null;
  description: string;
  unit: string;
  baseMaterialCost: number;
  baseLaborMinutes: number;
  active: boolean;
}): Promise<void> {
  const cfg = getSpreadsheetConfig();
  const key = input.sku || input.description;
  await upsertRowInSheet({
    spreadsheetId: cfg.spreadsheetId,
    tabName: cfg.itemsTab,
    keyAliases: ['SKU', 'Item SKU'],
    keyValue: key,
    setters: [
      { aliases: ['Category', 'Scope Category'], value: input.category || '' },
      { aliases: ['Manufacturer', 'Brand'], value: input.manufacturer || '' },
      { aliases: ['Model', 'Model Number'], value: input.model || '' },
      { aliases: ['Description', 'Item Description'], value: input.description || '' },
      { aliases: ['Unit', 'UOM', 'Base Unit'], value: input.unit || 'EA' },
      { aliases: ['BaseMaterialCost', 'Base Material Cost', 'Material Cost'], value: String(input.baseMaterialCost || 0) },
      { aliases: ['BaseLaborMinutes', 'Base Labor Minutes', 'Labor Minutes'], value: String(input.baseLaborMinutes || 0) },
      { aliases: ['Active', 'Is Active', 'Enabled'], value: input.active ? 'TRUE' : 'FALSE' },
      { aliases: ['UpdatedAt', 'Updated At'], value: new Date().toISOString() },
    ],
  });
}

export async function upsertModifierInGoogleSheet(input: {
  modifierKey: string;
  name: string;
  appliesToCategories: string[];
  addLaborMinutes: number;
  addMaterialCost: number;
  percentLabor: number;
  percentMaterial: number;
  active: boolean;
}): Promise<void> {
  const cfg = getSpreadsheetConfig();
  await upsertRowInSheet({
    spreadsheetId: cfg.spreadsheetId,
    tabName: cfg.modifiersTab,
    keyAliases: ['ModifierKey', 'Modifier Key', 'Key'],
    keyValue: input.modifierKey,
    setters: [
      { aliases: ['Name', 'Modifier Name', 'Modifier'], value: input.name || input.modifierKey },
      { aliases: ['AppliesToCategories', 'Applies To Categories', 'Categories'], value: (input.appliesToCategories || []).join(', ') },
      { aliases: ['AddLaborMinutes', 'Add Labor Minutes', 'Labor Minutes'], value: String(input.addLaborMinutes || 0) },
      { aliases: ['AddMaterialCost', 'Add Material Cost', 'Material Cost'], value: String(input.addMaterialCost || 0) },
      { aliases: ['PercentLabor', 'Percent Labor', 'Labor Percent'], value: String(input.percentLabor || 0) },
      { aliases: ['PercentMaterial', 'Percent Material', 'Material Percent'], value: String(input.percentMaterial || 0) },
      { aliases: ['Active', 'Is Active', 'Enabled'], value: input.active ? 'TRUE' : 'FALSE' },
      { aliases: ['UpdatedAt', 'Updated At'], value: new Date().toISOString() },
    ],
  });
}

export async function upsertBundleInGoogleSheet(input: {
  bundleId: string;
  bundleName: string;
  category?: string | null;
  includedSkus?: string[];
  includedModifiers?: string[];
  active: boolean;
}): Promise<void> {
  const cfg = getSpreadsheetConfig();
  await upsertRowInSheet({
    spreadsheetId: cfg.spreadsheetId,
    tabName: cfg.bundlesTab,
    keyAliases: ['BundleID', 'Bundle ID', 'ID'],
    keyValue: input.bundleId,
    setters: [
      { aliases: ['BundleName', 'Bundle Name', 'Name'], value: input.bundleName || input.bundleId },
      { aliases: ['Category', 'Scope Category'], value: input.category || '' },
      { aliases: ['IncludedSKUs', 'Included SKUs', 'SKUs', 'Items'], value: (input.includedSkus || []).join(', ') },
      { aliases: ['IncludedModifiers', 'Included Modifiers', 'Modifiers'], value: (input.includedModifiers || []).join(', ') },
      { aliases: ['Active', 'Is Active', 'Enabled'], value: input.active ? 'TRUE' : 'FALSE' },
      { aliases: ['UpdatedAt', 'Updated At'], value: new Date().toISOString() },
    ],
  });
}

function validateSheetRows(values: string[][], tabName: string): string[][] {
  if (!values || values.length === 0) {
    throw new Error(`Sheet tab ${tabName} is empty or missing.`);
  }
  return values
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function upsertItems(rows: string[][], warnings: string[]): number {
  const headers = rows[0].map(normalizeHeader);
  const skuCol = columnIndex(headers, ['sku', 'item sku']);
  const itemKeyCol = columnIndex(headers, ['item id', 'itemid', 'item key', 'search key', 'search key', 'search_key', 'key']);
  const categoryCol = columnIndex(headers, ['scope category', 'category']);
  const manufacturerCol = columnIndex(headers, ['manufacturer', 'brand']);
  const modelCol = columnIndex(headers, ['model', 'model number', 'modelnumber']);
  const descriptionCol = columnIndex(headers, ['description', 'item description']);
  const itemCol = columnIndex(headers, ['item', 'item name', 'itemname']);
  const uomCol = columnIndex(headers, ['unit', 'uom', 'base unit']);
  const materialCol = columnIndex(headers, ['material cost', 'basematerialcost', 'base material cost', 'base material', 'material']);
  const laborCol = columnIndex(headers, ['baselaborminutes', 'base labor minutes', 'labor minutes', 'labor mins']);
  const tagsCol = columnIndex(headers, ['keywords', 'tags', 'search terms']);
  const activeCol = columnIndex(headers, ['active', 'is active', 'isactive', 'enabled']);
  const notesCol = columnIndex(headers, ['notes', 'remarks']);
  const familyCol = columnIndex(headers, ['family']);
  const subcategoryCol = columnIndex(headers, ['subcategory', 'sub category']);

  if (descriptionCol === null && itemCol === null) {
    throw new Error('ITEMS tab is missing required headers. Expected Item or Description columns.');
  }

  if (skuCol === null && itemKeyCol === null) warnings.push('ITEMS: neither SKU nor Item Key header found; using fallback key for some rows.');

  // One-way master mode: Google Sheet defines active catalog records.
  estimatorDb.prepare('UPDATE catalog_items SET active = 0').run();

  let synced = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const sku = getCell(row, skuCol);
    const itemKey = getCell(row, itemKeyCol);
    const category = getCell(row, categoryCol);
    const itemName = getCell(row, itemCol);
    const description = getCell(row, descriptionCol) || itemName;

    if (!description) continue;

    const active = parseBoolean(getCell(row, activeCol), true);
    const stableKey = sku || itemKey || keyFromParts(category, itemName || description);

    const existing = sku
      ? estimatorDb.prepare('SELECT id FROM catalog_items WHERE lower(sku) = lower(?) LIMIT 1').get(sku) as { id: string } | undefined
      : estimatorDb.prepare('SELECT id FROM catalog_items WHERE id = ? OR (lower(description) = lower(?) AND lower(COALESCE(category, "")) = lower(?)) LIMIT 1').get(`sheet-item-${stableKey}`, description, category) as { id: string } | undefined;

    const id = existing?.id || `sheet-item-${stableKey}`;
    const tags = splitList(getCell(row, tagsCol));

    if (existing) {
      estimatorDb.prepare(`
        UPDATE catalog_items
        SET sku = ?, category = ?, subcategory = ?, family = ?, description = ?, uom = ?,
            manufacturer = ?, model = ?, base_material_cost = ?, base_labor_minutes = ?, tags = ?, notes = ?, active = ?
        WHERE id = ?
      `).run(
        sku || null,
        category || null,
        getCell(row, subcategoryCol) || null,
        getCell(row, familyCol) || null,
        description,
        getCell(row, uomCol) || 'EA',
        getCell(row, manufacturerCol) || null,
        getCell(row, modelCol) || null,
        parseNumber(getCell(row, materialCol), 0),
        parseNumber(getCell(row, laborCol), 0),
        JSON.stringify(tags),
        getCell(row, notesCol) || null,
        active ? 1 : 0,
        id
      );
    } else {
      estimatorDb.prepare(`
        INSERT INTO catalog_items (
          id, sku, category, subcategory, family, description, manufacturer, model, uom,
          base_material_cost, base_labor_minutes, labor_unit_type, taxable, ada_flag, tags, notes, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        sku || null,
        category || null,
        getCell(row, subcategoryCol) || null,
        getCell(row, familyCol) || null,
        description,
        getCell(row, manufacturerCol) || null,
        getCell(row, modelCol) || null,
        getCell(row, uomCol) || 'EA',
        parseNumber(getCell(row, materialCol), 0),
        parseNumber(getCell(row, laborCol), 0),
        null,
        1,
        0,
        JSON.stringify(tags),
        getCell(row, notesCol) || null,
        active ? 1 : 0
      );
    }

    synced += 1;
  }

  return synced;
}

function upsertModifiers(rows: string[][], warnings: string[]): number {
  const headers = rows[0].map(normalizeHeader);
  const keyCol = columnIndex(headers, ['modifier key', 'modifierkey', 'key', 'modifier']);
  const nameCol = columnIndex(headers, ['name', 'modifier name', 'modifiername', 'modifier', 'title', 'label', 'description']);
  const appliesCol = columnIndex(headers, ['applies to categories', 'appliestocategories', 'categories', 'scope category']);
  const addLaborCol = columnIndex(headers, ['add labor minutes', 'addlaborminutes', 'labor minutes', 'laborminutes', 'labor adjustment']);
  const addMaterialCol = columnIndex(headers, ['add material cost', 'addmaterialcost', 'material cost', 'materialcost', 'material adjustment']);
  const percentLaborCol = columnIndex(headers, ['percent labor', 'percentlabor', 'labor percent']);
  const percentMaterialCol = columnIndex(headers, ['percent material', 'percentmaterial', 'material percent']);
  const activeCol = columnIndex(headers, ['active', 'is active', 'isactive', 'enabled']);

  if (nameCol === null && keyCol === null) {
    throw new Error('MODIFIERS tab is missing required headers. Expected Name, Modifier, or Modifier Key.');
  }

  // One-way master mode: Google Sheet defines active modifiers.
  estimatorDb.prepare('UPDATE modifiers_v1 SET active = 0').run();

  let synced = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const name = getCell(row, nameCol) || getCell(row, keyCol);
    if (!name) continue;

    const modifierKey = (getCell(row, keyCol) || keyFromParts(name)).toUpperCase().replace(/\s+/g, '_');
    const existing = estimatorDb.prepare('SELECT id FROM modifiers_v1 WHERE modifier_key = ? LIMIT 1').get(modifierKey) as { id: string } | undefined;
    const id = existing?.id || `sheet-mod-${keyFromParts(modifierKey)}`;

    const applies = splitList(getCell(row, appliesCol));
    if (!applies.length) warnings.push(`MODIFIERS: ${name} has no applies-to categories.`);

    if (existing) {
      estimatorDb.prepare(`
        UPDATE modifiers_v1
        SET name = ?, applies_to_categories = ?, add_labor_minutes = ?, add_material_cost = ?,
            percent_labor = ?, percent_material = ?, active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name,
        JSON.stringify(applies),
        parseNumber(getCell(row, addLaborCol), 0),
        parseNumber(getCell(row, addMaterialCol), 0),
        parseNumber(getCell(row, percentLaborCol), 0),
        parseNumber(getCell(row, percentMaterialCol), 0),
        parseBoolean(getCell(row, activeCol), true) ? 1 : 0,
        new Date().toISOString(),
        id
      );
    } else {
      estimatorDb.prepare(`
        INSERT INTO modifiers_v1 (
          id, name, modifier_key, applies_to_categories, add_labor_minutes, add_material_cost,
          percent_labor, percent_material, active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        name,
        modifierKey,
        JSON.stringify(applies),
        parseNumber(getCell(row, addLaborCol), 0),
        parseNumber(getCell(row, addMaterialCol), 0),
        parseNumber(getCell(row, percentLaborCol), 0),
        parseNumber(getCell(row, percentMaterialCol), 0),
        parseBoolean(getCell(row, activeCol), true) ? 1 : 0,
        new Date().toISOString()
      );
    }

    synced += 1;
  }

  return synced;
}

function upsertBundles(rows: string[][], warnings: string[]): { bundlesSynced: number; bundleItemsSynced: number } {
  const headers = rows[0].map(normalizeHeader);
  const idCol = columnIndex(headers, ['bundle id', 'id']);
  const nameCol = columnIndex(headers, ['bundle name', 'name']);
  const categoryCol = columnIndex(headers, ['category', 'scope category']);
  const skuListCol = columnIndex(headers, ['included skus', 'included sku', 'skus', 'items', 'included items']);
  const modifierListCol = columnIndex(headers, ['included modifiers', 'modifiers']);
  const activeCol = columnIndex(headers, ['active', 'is active', 'enabled']);

  if (nameCol === null) {
    throw new Error('BUNDLES tab is missing required Bundle Name header.');
  }

  // One-way master mode: Google Sheet defines active bundles.
  estimatorDb.prepare('UPDATE bundles_v1 SET active = 0').run();

  const catalogSkuRows = estimatorDb.prepare(`
    SELECT id, sku, description, base_material_cost, base_labor_minutes
    FROM catalog_items
    WHERE sku IS NOT NULL AND trim(sku) <> ''
  `).all() as Array<{
    id: string;
    sku: string;
    description: string;
    base_material_cost: number;
    base_labor_minutes: number;
  }>;

  const catalogBySku = new Map<string, {
    id: string;
    sku: string;
    description: string;
    baseMaterialCost: number;
    baseLaborMinutes: number;
  }>();

  catalogSkuRows.forEach((row) => {
    const normalized = normalizeSkuToken(row.sku);
    if (!normalized || catalogBySku.has(normalized)) return;
    catalogBySku.set(normalized, {
      id: row.id,
      sku: row.sku,
      description: row.description,
      baseMaterialCost: Number(row.base_material_cost || 0),
      baseLaborMinutes: Number(row.base_labor_minutes || 0),
    });
  });

  const modifierRows = estimatorDb.prepare('SELECT modifier_key FROM modifiers_v1').all() as Array<{ modifier_key: string }>;
  const modifierByCanonicalKey = new Map<string, string>();
  modifierRows.forEach((row) => {
    const key = normalizeModifierToken(row.modifier_key);
    const canonical = canonicalKey(key);
    if (!canonical || modifierByCanonicalKey.has(canonical)) return;
    modifierByCanonicalKey.set(canonical, key);
  });

  let bundlesSynced = 0;
  let bundleItemsSynced = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const bundleName = getCell(row, nameCol);
    if (!bundleName) continue;

    const bundleId = getCell(row, idCol) || `sheet-bundle-${keyFromParts(bundleName)}`;
    const existing = estimatorDb.prepare('SELECT id FROM bundles_v1 WHERE id = ? LIMIT 1').get(bundleId) as { id: string } | undefined;
    const active = parseBoolean(getCell(row, activeCol), true) ? 1 : 0;

    if (existing) {
      estimatorDb.prepare('UPDATE bundles_v1 SET bundle_name = ?, category = ?, active = ?, updated_at = ? WHERE id = ?')
        .run(bundleName, getCell(row, categoryCol) || null, active, new Date().toISOString(), bundleId);
    } else {
      estimatorDb.prepare('INSERT INTO bundles_v1 (id, bundle_name, category, active, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(bundleId, bundleName, getCell(row, categoryCol) || null, active, new Date().toISOString());
    }

    estimatorDb.prepare('DELETE FROM bundle_items_v1 WHERE bundle_id = ?').run(bundleId);

    const includedSkus = Array.from(
      new Set(splitList(getCell(row, skuListCol)).map((token) => token.trim()).filter(Boolean))
    );

    const normalizedModifiers = splitList(getCell(row, modifierListCol)).map((token) => token.trim()).filter(Boolean);
    const validModifierKeys: string[] = [];

    normalizedModifiers.forEach((modifierToken) => {
      const canonical = canonicalKey(modifierToken);
      const matchedKey = canonical ? modifierByCanonicalKey.get(canonical) : null;
      if (!matchedKey) {
        warnings.push(`BUNDLES row ${i + 1} (${bundleName}): unknown modifier key "${modifierToken}".`);
        return;
      }
      validModifierKeys.push(matchedKey);
    });

    includedSkus.forEach((skuToken, index) => {
      const normalizedSku = normalizeSkuToken(skuToken);
      const catalog = normalizedSku ? catalogBySku.get(normalizedSku) : null;
      if (!catalog) {
        warnings.push(`BUNDLES row ${i + 1} (${bundleName}): unknown SKU "${skuToken}".`);
        return;
      }

      const notes = validModifierKeys.length ? `Included Modifiers: ${validModifierKeys.join(', ')}` : null;
      estimatorDb.prepare(`
        INSERT INTO bundle_items_v1 (
          id, bundle_id, catalog_item_id, sku, description, qty, material_cost, labor_minutes, labor_cost, sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `${bundleId}-item-${index + 1}`,
        bundleId,
        catalog.id,
        catalog.sku,
        catalog.description || skuToken,
        1,
        catalog.baseMaterialCost,
        catalog.baseLaborMinutes,
        unitLaborCostFromMinutes(catalog.baseLaborMinutes),
        index,
        notes
      );
      bundleItemsSynced += 1;
    });

    if (!includedSkus.length) {
      warnings.push(`BUNDLES row ${i + 1} (${bundleName}): no included SKUs provided.`);
    }

    bundlesSynced += 1;
  }

  return { bundlesSynced, bundleItemsSynced };
}

export async function syncCatalogFromGoogleSheets(): Promise<CatalogSyncResult> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '1QWCGCssWtAQ8Pjx9_-7LDs4lraRbptURd8D04bNvnEg';
  const itemsTab = process.env.GOOGLE_SHEETS_TAB_ITEMS || 'ITEMS';
  const modifiersTab = process.env.GOOGLE_SHEETS_TAB_MODIFIERS || 'MODIFIERS';
  const bundlesTab = process.env.GOOGLE_SHEETS_TAB_BUNDLES || 'BUNDLES';

  if (!spreadsheetId) {
    throw new Error('Missing spreadsheet ID. Set GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_SHEETS_ID.');
  }

  const warnings: string[] = [];
  updateSyncStatus({ status: 'running', message: 'Catalog sync in progress...' });

  try {
    const auth = buildAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const [itemsRes, modifiersRes, bundlesRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${itemsTab}!A:ZZ` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${modifiersTab}!A:ZZ` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${bundlesTab}!A:ZZ` }),
    ]);

    const itemRows = validateSheetRows((itemsRes.data.values || []) as string[][], itemsTab);
    const modifierRows = validateSheetRows((modifiersRes.data.values || []) as string[][], modifiersTab);
    const bundleRows = validateSheetRows((bundlesRes.data.values || []) as string[][], bundlesTab);

    const tx = estimatorDb.transaction(() => {
      const itemsSynced = upsertItems(itemRows, warnings);
      const modifiersSynced = upsertModifiers(modifierRows, warnings);
      const bundleData = upsertBundles(bundleRows, warnings);
      return {
        itemsSynced,
        modifiersSynced,
        bundlesSynced: bundleData.bundlesSynced,
        bundleItemsSynced: bundleData.bundleItemsSynced,
      };
    });

    const counts = tx();
    const uniqueWarnings = Array.from(new Set(warnings));
    const syncedAt = new Date().toISOString();
    const message = `Catalog sync complete: ${counts.itemsSynced} items, ${counts.modifiersSynced} modifiers, ${counts.bundlesSynced} bundles.`;

    updateSyncStatus({
      status: 'success',
      message,
      counts,
      warnings: uniqueWarnings,
    });

    insertSyncRun({
      status: 'success',
      message,
      counts,
      warnings: uniqueWarnings,
    });

    return {
      ...counts,
      message,
      spreadsheetId,
      tabs: {
        items: itemsTab,
        modifiers: modifiersTab,
        bundles: bundlesTab,
      },
      warnings: uniqueWarnings,
      syncedAt,
    };
  } catch (error: any) {
    const failedCounts = {
      itemsSynced: 0,
      modifiersSynced: 0,
      bundlesSynced: 0,
      bundleItemsSynced: 0,
    };

    updateSyncStatus({
      status: 'failed',
      message: error.message || 'Catalog sync failed.',
      counts: failedCounts,
      warnings,
    });

    insertSyncRun({
      status: 'failed',
      message: error.message || 'Catalog sync failed.',
      counts: failedCounts,
      warnings,
    });
    throw error;
  }
}
