/**
 * Brighten Install — Catalog workbook cleanup / rebuild helper.
 *
 * Purpose:
 * - Enforce a single, uncluttered tab set in the source Google Sheet.
 * - Prefer CLEAN_ITEMS as the canonical "clean output" (while keeping main source tabs
 *   ITEMS / MODIFIERS / BUNDLES / ALIASES / ATTRIBUTES).
 * - Preserve governance tabs (ALIASES / ATTRIBUTES / LEGACY_ITEMS / RESEARCH_QUEUE / CATEGORY_PLAN / META / DEFAULT_ITEMS).
 *
 * IMPORTANT:
 * - This script is intentionally *non-destructive* to main source tabs. It only:
 *   - deletes known duplicate helper tabs (or renames them into the preferred convention), and
 *   - regenerates/overwrites SYNC_README to document the tab purposes.
 *
 * Usage:
 * - In Apps Script attached to the workbook:
 *   - Reload the spreadsheet (menu appears), or run `onOpen()` manually once.
 *   - Use Catalog → Cleanup tabs / Rebuild clean catalog / Generate research queue / Refresh sync readme.
 */

/**
 * Desired workbook order (order matters).
 * Curated/working tabs first, then raw/helper/admin tabs.
 */
const DESIRED_TABS = [
  // Curated / working
  'CLEAN_ITEMS',
  'ALIASES',
  'ATTRIBUTES',
  'MODIFIERS',
  'BUNDLES',
  // Raw / staging
  'ITEMS',
  // Helper / admin
  'LEGACY_ITEMS',
  'RESEARCH_QUEUE',
  'CATEGORY_PLAN',
  'SYNC_README',
  'META',
  'DEFAULT_ITEMS',
];

/**
 * Duplicate/overlapping helper tabs to unify.
 * Recommended convention (chosen): CLEAN_MODIFIERS / CLEAN_BUNDLES / SYNC_README.
 */
const TAB_CANONICAL_ALIASES = [
  { from: 'MODIFIERS_CLEAN', to: 'CLEAN_MODIFIERS' },
  { from: 'BUNDLES_CLEAN', to: 'CLEAN_BUNDLES' },
  // Prefer SYNC_README only.
  { from: 'SYNC_NOTES', to: 'SYNC_README' },
];

/** Tabs we will delete if present after canonicalization/unification. */
const TAB_DELETIONS = [
  // Duplicate clean tabs (we keep CLEAN_*).
  'MODIFIERS_CLEAN',
  'BUNDLES_CLEAN',
  // Duplicate docs tab (we keep SYNC_README).
  'SYNC_NOTES',
];

/** If present, we keep it but stop generating it by default; SYNC_README explains purpose. */
const OPTIONAL_TABS_PRESERVED = ['RECOMMENDED_ITEMS'];

/** Known headers (documented; we do not force-overwrite main tabs). */
const HEADERS = {
  ITEMS: [
    'SKU',
    'Category',
    'Manufacturer',
    'Model',
    'Series',
    'Description',
    'Unit',
    'BaseMaterialCost',
    'BaseLaborMinutes',
    'Active',
    'UpdatedAt',
    'GenericItemName',
    'DefaultModifiers',
    'ImageURL',
  ],
  MODIFIERS: ['ModifierKey', 'AppliesToCategories', 'AddLaborMinutes', 'AddMaterialCost', 'PercentLabor', 'PercentMaterial', 'Active', 'UpdatedAt'],
  BUNDLES: ['BundleID', 'BundleName', 'Category', 'IncludedSKUs', 'IncludedModifiers', 'Active', 'UpdatedAt'],
  ALIASES: ['Canonical_SKU', 'AliasType', 'AliasValue', 'Active', 'Notes'],
  ATTRIBUTES: [
    'Canonical_SKU',
    'AttributeType',
    'AttributeValue',
    'MaterialDeltaType',
    'MaterialDeltaValue',
    'LaborDeltaType',
    'LaborDeltaValue',
    'Active',
    'SortOrder',
    'Notes',
  ],
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Catalog')
    .addItem('Cleanup tabs', 'catalogSyncCleanup')
    .addSeparator()
    .addItem('Rebuild LEGACY_ITEMS from ITEMS (safe)', 'catalogRebuildLegacyItems')
    .addItem('Force rebuild CLEAN_ITEMS from ITEMS (type OVERWRITE)', 'catalogForceRebuildCleanItems')
    .addItem('Fix CLEAN_ITEMS cutover blockers (headers + orphans)', 'catalogFixCleanItemsCutoverBlockers')
    .addItem('Generate research queue', 'catalogGenerateResearchQueue')
    .addItem('Generate missing images worklist', 'catalogGenerateMissingImagesWorklist')
    .addItem('Audit CLEAN_ITEMS readiness (cutover)', 'catalogAuditCleanItemsReadiness')
    .addSeparator()
    .addItem('Refresh sync readme', 'catalogRefreshSyncReadme')
    .addToUi();
}

function getOrCreateSheet_(ss, name) {
  const existing = ss.getSheetByName(name);
  if (existing) return existing;
  return ss.insertSheet(name);
}

function safeRenameSheet_(ss, fromName, toName) {
  const from = ss.getSheetByName(fromName);
  if (!from) return false;
  const to = ss.getSheetByName(toName);
  if (to) return false; // don't overwrite existing target
  from.setName(toName);
  return true;
}

function deleteSheetIfExists_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return false;
  ss.deleteSheet(sh);
  return true;
}

function moveSheetToEnd_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return;
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(ss.getSheets().length);
}

function ensureHeaderRow_(sheet, headers) {
  if (!headers || headers.length === 0) return;
  const firstRow = sheet.getRange(1, 1, 1, Math.max(1, headers.length)).getValues()[0];
  const normalized = firstRow.map((v) => String(v || '').trim());
  const matches = headers.every((h, i) => normalized[i] === h);
  if (matches) return;
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function normalizeHeader_(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function headerSynonyms_() {
  return {
    sku: ['sku', 'item sku', 'itemsku', 'product sku', 'catalog sku', 'canonical sku', 'canonical_sku', 'canonical sku'],
    unit: ['unit', 'uom', 'units', 'unit of measure', 'unitofmeasure'],
    active: ['active', 'enabled', 'is active', 'isactive'],
    category: ['category', 'cat'],
    manufacturer: ['manufacturer', 'mfr', 'brand'],
    description: ['description', 'desc', 'item description'],
    basematerialcost: ['basematerialcost', 'base material cost', 'material cost', 'cost', 'material'],
    baselaborminutes: ['baselaborminutes', 'base labor minutes', 'labor minutes', 'labor'],
    imageurl: ['imageurl', 'image url', 'image', 'image link', 'photourl', 'photo url', 'photo'],
    model: ['model'],
    series: ['series'],
    updatedat: ['updatedat', 'updated at', 'last updated', 'updated'],
    genericitemname: ['genericitemname', 'generic item name', 'generic name'],
    defaultmodifiers: ['defaultmodifiers', 'default modifiers', 'modifiers'],
  };
}

function findHeaderIndexBySynonyms_(headers, synonyms) {
  const idx = headerIndexMap_(headers);
  const syns = synonyms || [];
  for (let i = 0; i < syns.length; i++) {
    const k = normalizeHeader_(syns[i]);
    if (idx[k] != null) return idx[k];
  }
  return null;
}

function repairHeaderRowBySynonyms_(sheet, canonicalHeaders) {
  const current = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  const currentTrim = current.map((v) => String(v || '').trim());
  const syn = headerSynonyms_();

  // Build mapping from canonical header -> existing column index
  const canonicalToExisting = {};
  canonicalHeaders.forEach((h) => {
    const key = normalizeHeader_(h);
    const synonyms = syn[key] || [key, h];
    const foundIdx = findHeaderIndexBySynonyms_(currentTrim, synonyms);
    if (foundIdx != null) canonicalToExisting[h] = foundIdx;
  });

  // If a required canonical header doesn't exist, append it (non-destructive)
  const needed = canonicalHeaders.filter((h) => canonicalToExisting[h] == null);
  let lastCol = Math.max(1, sheet.getLastColumn());
  if (needed.length) {
    sheet.insertColumnsAfter(lastCol, needed.length);
    lastCol += needed.length;
    const start = lastCol - needed.length + 1;
    sheet.getRange(1, start, 1, needed.length).setValues([needed]);
    needed.forEach((h, i) => {
      canonicalToExisting[h] = start - 1 + i;
    });
  }

  // Rewrite header cells in-place for any columns we detected, but do not reorder columns automatically.
  // This makes the audit pass without risking user data by shuffling columns.
  canonicalHeaders.forEach((h) => {
    const colIdx0 = canonicalToExisting[h];
    if (colIdx0 == null) return;
    const currentVal = String(currentTrim[colIdx0] || '').trim();
    if (currentVal !== h) {
      sheet.getRange(1, colIdx0 + 1).setValue(h);
    }
  });

  sheet.setFrozenRows(1);
}

function headerIndexMap_(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const key = normalizeHeader_(h);
    if (key) map[key] = i;
  });
  return map;
}

function cell_(row, idx) {
  if (idx == null || idx < 0) return '';
  return row[idx];
}

function truthy_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return false;
  return ['true', '1', 'yes', 'y', 'active', 'enabled'].includes(s);
}

function looksGenericSku_(sku) {
  const s = String(sku || '').trim();
  if (!s) return true;
  if (/^generic[-_]/i.test(s) || /^gen[-_]/i.test(s)) return true;
  if (/^placeholder/i.test(s)) return true;
  return false;
}

function readOptionalBoolGs_(row, idx, defaultValue) {
  if (idx == null) return defaultValue;
  const s = String(cell_(row, idx) || '').trim().toLowerCase();
  if (!s) return defaultValue;
  if (['false', '0', 'no', 'n', 'inactive', 'disabled'].includes(s)) return false;
  if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(s)) return true;
  return defaultValue;
}

/**
 * Ensure RESEARCH_QUEUE has enough columns; fill missing header cells from `headerNames` without wiping row 1.
 */
function ensureResearchQueueMinColumns_(research, minCols, headerNames) {
  let last = research.getLastColumn();
  if (last < 1) last = 1;
  if (last < minCols) {
    research.insertColumnsAfter(last, minCols - last);
  }
  const row1 = research.getRange(1, 1, 1, minCols).getValues()[0];
  const next = [];
  for (let i = 0; i < minCols; i++) {
    const cur = String(row1[i] || '').trim();
    const fallback = headerNames[i] ? String(headerNames[i]) : '';
    next.push(cur || fallback);
  }
  research.getRange(1, 1, 1, minCols).setValues([next]);
  research.setFrozenRows(1);
  return minCols;
}

/** Append image-priority summary under existing META audit (does not clear META). */
function appendMetaImagePriorityBlock_(ss, payload) {
  const meta = ss.getSheetByName('META');
  if (!meta) return;
  const start = Math.max(1, meta.getLastRow()) + 2;
  const lines = [];
  lines.push(['### Image priority worklist (append-only)', new Date().toISOString(), '', '']);
  lines.push(['Source tab', payload.sourceName, '', '']);
  lines.push(['RESEARCH_QUEUE rows appended', String(payload.queued), '', '']);
  lines.push(['', '', '', '']);
  lines.push(['Top categories (missing ImageURL)', 'Active rows in tab', 'Missing images', 'Gap %']);
  payload.topCategories.forEach((r) => {
    lines.push([r.name, r.active, r.missing, r.pct]);
  });
  lines.push(['', '', '', '']);
  lines.push(['Top SKUs by priority score', 'Score', 'Category gap %', 'Manufacturer-backed']);
  payload.topSkus.forEach((r) => {
    lines.push([r.sku, r.score, r.gapPct, r.mfrBacked]);
  });
  meta.getRange(start, 1, start + lines.length - 1, 4).setValues(lines);
}

function writeSyncReadme_(ss) {
  const sh = getOrCreateSheet_(ss, 'SYNC_README');
  sh.clear({ contentsOnly: true });

  const rows = [];
  rows.push(['Brighten Install — Catalog sync workbook']);
  rows.push(['']);
  rows.push(['### Purpose']);
  rows.push([
    'This workbook is the governed source of truth for catalog rows (ITEMS), install modifiers (MODIFIERS), bundles (BUNDLES), alias mappings (ALIASES), and structured attributes (ATTRIBUTES). Helper tabs exist to support normalization and safe transition away from duplicate SKUs.',
  ]);
  rows.push(['']);
  rows.push(['### Curated / working tabs']);
  rows.push(['Tab', 'What it is', 'Who uses it', 'Notes']);

  const explain = (tab, what, who, notes) => rows.push([tab, what, who, notes || '']);
  explain(
    'CLEAN_ITEMS',
    'Curated forward-facing catalog layer (intended working surface for governed items).',
    'Catalog governance',
    'ImageURL completeness is a priority here. This script can overwrite it only when you explicitly run the overwrite rebuild action.'
  );
  explain('ALIASES', 'Alias mappings to canonical SKUs (legacy_sku, vendor_sku, parser_phrase, etc.).', 'Catalog governance', 'Synced by app.');
  explain('ATTRIBUTES', 'Structured variants (finish/mounting/coating/grip/assembly) with optional deltas.', 'Catalog governance', 'Synced by app. Percent inputs are percent points (10 = 10%).');
  explain('MODIFIERS', 'Install add-ins / modifiers.', 'App sync + estimator', 'Source tab; scripts should not delete or overwrite unless blank.');
  explain('BUNDLES', 'Prebuilt scope bundles (IDs + included SKUs/modifiers).', 'App sync + estimator', 'Source tab; scripts should not delete or overwrite unless blank.');

  rows.push(['']);
  rows.push(['### Raw / staging tabs']);
  rows.push(['Tab', 'What it is', 'Who uses it', 'Notes']);
  explain(
    'ITEMS',
    'Raw/staging item rows (may include drafts, imports, and transitional rows).',
    'App sync + admin',
    'Staging/reference only. The app is intended to sync from CLEAN_ITEMS after cutover; do not treat ITEMS as curated.'
  );

  rows.push(['']);
  rows.push(['### Helper / admin tabs (safe for scripts to rebuild unless noted)']);
  rows.push(['Tab', 'What it is', 'Who uses it', 'Notes']);
  explain('LEGACY_ITEMS', 'Inactive rows derived from ITEMS (inactive rows).', 'Admin / migrations', 'Safe to rebuild; does not delete source rows.');
  explain(
    'RESEARCH_QUEUE',
    'Open questions / vendor research worklist.',
    'Admin',
    '“Generate missing images worklist” appends Kind=missing_image rows from CLEAN_ITEMS with PriorityScore / CategoryGapPct / ManufacturerBacked / ForwardCanonical. META gets an append-only image summary below the audit.'
  );
  explain('CATEGORY_PLAN', 'Taxonomy planning: categories/families/coverage goals.', 'Admin', '');
  explain('META', 'Workbook metadata and sync config notes.', 'Admin', '');
  explain('DEFAULT_ITEMS', 'Seed defaults / starter-pack baseline rows.', 'Admin + bootstrap', 'Used to keep local dev usable.');

  if (ss.getSheetByName('RECOMMENDED_ITEMS')) {
    rows.push(['']);
    rows.push(['### Optional / transitional tabs (kept only if present)']);
    explain(
      'RECOMMENDED_ITEMS',
      'Transitional normalization worksheet (optional).',
      'Admin',
      'If kept, treat as scratchpad for mapping messy vendor inputs → canonical item + attributes. CLEAN_ITEMS is the forward-facing cleaned output.'
    );
  }

  rows.push(['']);
  rows.push(['### App sync behavior (install331)']);
  rows.push(['The app syncs from: CLEAN_ITEMS, MODIFIERS, BUNDLES, ALIASES, ATTRIBUTES.']);
  rows.push(['ITEMS is raw/staging only and is not intended to be the live sync source after cutover.']);
  rows.push(['Do not overwrite CLEAN_ITEMS casually. Use the FORCE rebuild action only when you intend to discard curated edits.']);
  rows.push(['Switching live sync to CLEAN_ITEMS is a deliberate operational step (see META audit output).']);
  rows.push(['Aliases drive canonical-first matching; attributes drive governed variants (finish/mounting/coating/grip/assembly).']);
  rows.push(['']);
  rows.push(['### Cutover plan (do not do casually)']);
  rows.push(['Pre-switch: run "Audit CLEAN_ITEMS readiness (cutover)" and resolve orphaned aliases/attributes + missing critical fields.']);
  rows.push(['Switch: set env GOOGLE_SHEETS_TAB_ITEMS=CLEAN_ITEMS (keep ALIASES/ATTRIBUTES as-is).']);
  rows.push(['Post-switch: run sync; confirm counts match expectations; spot-check search + a few SKUs; rollback by setting GOOGLE_SHEETS_TAB_ITEMS=ITEMS.']);
  rows.push(['If audit reports missing headers like SKU/Unit, use "Fix CLEAN_ITEMS cutover blockers (headers + orphans)" before attempting cutover.']);
  rows.push(['']);
  rows.push(['### Tabs this script stops generating']);
  rows.push(['- MODIFIERS_CLEAN (duplicate helper tab)']);
  rows.push(['- BUNDLES_CLEAN (duplicate helper tab)']);
  rows.push(['- SYNC_NOTES (use SYNC_README only)']);

  sh.getRange(1, 1, rows.length, 4).setValues(
    rows.map((r) => {
      // pad to 4 cols for consistent setValues
      const out = [r[0] || '', r[1] || '', r[2] || '', r[3] || ''];
      return out;
    })
  );
  sh.setFrozenRows(0);
  sh.autoResizeColumns(1, 4);
}

function catalogRefreshSyncReadme() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Do not modify any source tab data.
  writeSyncReadme_(ss);
}

/**
 * Rebuild helper outputs from the authoritative source tabs.
 * - CLEAN_ITEMS: active rows from ITEMS
 * - LEGACY_ITEMS: inactive rows from ITEMS
 *
 * Non-destructive:
 * - Does not change ITEMS.
 * - Only overwrites helper tabs.
 */
function catalogRebuildCleanCatalog() {
  // Back-compat safety: this function used to overwrite CLEAN_ITEMS.
  // Keep it as a guarded entrypoint so older menus/scripts don't destroy curated work.
  return catalogForceRebuildCleanItems();
}

function catalogRebuildLegacyItems() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const items = ss.getSheetByName('ITEMS');
  if (!items) throw new Error('ITEMS tab not found.');

  const values = items.getDataRange().getValues();
  if (!values || values.length === 0) return;
  const headers = values[0].map((v) => String(v || '').trim());
  const idx = headerIndexMap_(headers);
  const activeIdx = idx['active'] != null ? idx['active'] : null;
  const data = values.slice(1).filter((r) => r.some((v) => String(v || '').trim()));
  const inactiveRows = data.filter((r) => (activeIdx == null ? false : !truthy_(cell_(r, activeIdx))));

  const legacy = getOrCreateSheet_(ss, 'LEGACY_ITEMS');
  legacy.clear({ contentsOnly: true });
  legacy.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (inactiveRows.length) legacy.getRange(2, 1, inactiveRows.length, headers.length).setValues(inactiveRows);
  legacy.setFrozenRows(1);

  catalogRefreshSyncReadme();
}

function catalogForceRebuildCleanItems() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Force rebuild CLEAN_ITEMS',
    'This will OVERWRITE CLEAN_ITEMS with active rows from ITEMS.\n\nTo confirm, type OVERWRITE (all caps).',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const text = String(response.getResponseText() || '').trim();
  if (text !== 'OVERWRITE') {
    ui.alert('Canceled. CLEAN_ITEMS was not changed.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const items = ss.getSheetByName('ITEMS');
  if (!items) throw new Error('ITEMS tab not found.');

  const values = items.getDataRange().getValues();
  if (!values || values.length === 0) return;
  const headers = values[0].map((v) => String(v || '').trim());
  const idx = headerIndexMap_(headers);
  const activeIdx = idx['active'] != null ? idx['active'] : null;

  const data = values.slice(1).filter((r) => r.some((v) => String(v || '').trim()));
  const activeRows = data.filter((r) => (activeIdx == null ? true : truthy_(cell_(r, activeIdx))));
  const inactiveRows = data.filter((r) => (activeIdx == null ? false : !truthy_(cell_(r, activeIdx))));

  const clean = getOrCreateSheet_(ss, 'CLEAN_ITEMS');
  clean.clear({ contentsOnly: true });
  clean.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (activeRows.length) clean.getRange(2, 1, activeRows.length, headers.length).setValues(activeRows);
  clean.setFrozenRows(1);

  const legacy = getOrCreateSheet_(ss, 'LEGACY_ITEMS');
  legacy.clear({ contentsOnly: true });
  legacy.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (inactiveRows.length) legacy.getRange(2, 1, inactiveRows.length, headers.length).setValues(inactiveRows);
  legacy.setFrozenRows(1);

  catalogRefreshSyncReadme();
}

/**
 * Non-destructive readiness audit for CLEAN_ITEMS.
 * Writes a summary + category breakdown into META (no new clutter tabs).
 */
function catalogAuditCleanItemsReadiness() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const clean = ss.getSheetByName('CLEAN_ITEMS');
  if (!clean) throw new Error('CLEAN_ITEMS tab not found.');
  const aliasesSh = ss.getSheetByName('ALIASES');
  const attrsSh = ss.getSheetByName('ATTRIBUTES');

  const values = clean.getDataRange().getValues();
  if (!values || values.length < 2) {
    SpreadsheetApp.getUi().alert('CLEAN_ITEMS is empty (no data rows).');
    return;
  }

  const headersRaw = values[0].map((v) => String(v || '').trim());
  const idx = headerIndexMap_(headersRaw);
  const meta = getOrCreateSheet_(ss, 'META');
  meta.clear({ contentsOnly: true });

  const requiredHeaderKeys = [
    'sku',
    'category',
    'manufacturer',
    'description', // app hard-requires description or item name; this is the curated expectation
    'unit',
    'basematerialcost',
    'baselaborminutes',
    'active',
    'imageurl',
  ];

  const headerChecks = requiredHeaderKeys.map((k) => [k, idx[k] != null ? 'OK' : 'MISSING']);
  const missingHeaders = headerChecks.filter((r) => r[1] === 'MISSING').map((r) => r[0]);

  const rows = values.slice(1).filter((r) => r.some((v) => String(v || '').trim()));
  const activeIdx = idx['active'] != null ? idx['active'] : null;
  const activeRows = rows.filter((r) => (activeIdx == null ? true : truthy_(cell_(r, activeIdx))));

  const col = (key) => (idx[key] != null ? idx[key] : null);
  const skuIdx = col('sku');
  const catIdx = col('category');
  const mfrIdx = col('manufacturer');
  const modelIdx = col('model');
  const seriesIdx = col('series');
  const descIdx = col('description');
  const imageIdx = col('imageurl');
  const matIdx = col('basematerialcost');
  const laborIdx = col('baselaborminutes');

  const counts = {
    active: activeRows.length,
    missingImage: 0,
    missingMfr: 0,
    missingModelSeries: 0,
    missingMaterial: 0,
    missingLabor: 0,
    missingDescription: 0,
    missingCategory: 0,
    orphanAliasRows: 0,
    orphanAttributeRows: 0,
  };

  const perCategory = {}; // category -> counters
  const bumpCat = (category, field) => {
    const key = category || '(Uncategorized)';
    if (!perCategory[key]) {
      perCategory[key] = { active: 0, missingImage: 0, missingMfr: 0, missingModelSeries: 0, missingMaterial: 0, missingLabor: 0 };
    }
    if (field === 'active') perCategory[key].active += 1;
    else perCategory[key][field] += 1;
  };

  activeRows.forEach((r) => {
    const category = catIdx == null ? '' : String(cell_(r, catIdx) || '').trim();
    bumpCat(category, 'active');

    const description = descIdx == null ? '' : String(cell_(r, descIdx) || '').trim();
    if (!description) counts.missingDescription += 1;
    const catVal = catIdx == null ? '' : String(cell_(r, catIdx) || '').trim();
    if (catIdx != null && !catVal) counts.missingCategory += 1;

    const imageUrl = imageIdx == null ? '' : String(cell_(r, imageIdx) || '').trim();
    if (imageIdx != null && !imageUrl) {
      counts.missingImage += 1;
      bumpCat(category, 'missingImage');
    }
    const manufacturer = mfrIdx == null ? '' : String(cell_(r, mfrIdx) || '').trim();
    if (mfrIdx != null && !manufacturer) {
      counts.missingMfr += 1;
      bumpCat(category, 'missingMfr');
    }
    const model = modelIdx == null ? '' : String(cell_(r, modelIdx) || '').trim();
    const series = seriesIdx == null ? '' : String(cell_(r, seriesIdx) || '').trim();
    if (modelIdx != null && seriesIdx != null && !model && !series) {
      counts.missingModelSeries += 1;
      bumpCat(category, 'missingModelSeries');
    }
    const mat = matIdx == null ? '' : String(cell_(r, matIdx) || '').trim();
    if (matIdx != null && mat === '') {
      counts.missingMaterial += 1;
      bumpCat(category, 'missingMaterial');
    }
    const labor = laborIdx == null ? '' : String(cell_(r, laborIdx) || '').trim();
    if (laborIdx != null && labor === '') {
      counts.missingLabor += 1;
      bumpCat(category, 'missingLabor');
    }
  });

  // Alignment checks: ensure ALIASES/ATTRIBUTES Canonical_SKU exists in CLEAN_ITEMS.
  const canonicalSkus = new Set(
    activeRows
      .map((r) => (skuIdx == null ? '' : String(cell_(r, skuIdx) || '').trim()))
      .filter((s) => s)
      .map((s) => String(s).trim())
  );

  const readOrphans = (sheet, kind) => {
    if (!sheet) return { orphans: 0, missingExamples: [] };
    const v = sheet.getDataRange().getValues();
    if (!v || v.length < 2) return { orphans: 0, missingExamples: [] };
    const h = v[0].map((x) => String(x || '').trim());
    const m = headerIndexMap_(h);
    const canonIdx = m['canonical sku'] != null ? m['canonical sku'] : m['canonical_sku'] != null ? m['canonical_sku'] : m['sku'] != null ? m['sku'] : null;
    const activeIdx2 = m['active'] != null ? m['active'] : null;
    if (canonIdx == null) return { orphans: 0, missingExamples: [`${kind}: missing Canonical_SKU header`] };
    let orphans = 0;
    const examples = [];
    v.slice(1).forEach((r) => {
      const canon = String(cell_(r, canonIdx) || '').trim();
      if (!canon) return;
      if (activeIdx2 != null && !truthy_(cell_(r, activeIdx2))) return;
      if (!canonicalSkus.has(canon)) {
        orphans += 1;
        if (examples.length < 8) examples.push(canon);
      }
    });
    return { orphans, missingExamples: examples };
  };

  const aliasOrphans = readOrphans(aliasesSh, 'ALIASES');
  const attrOrphans = readOrphans(attrsSh, 'ATTRIBUTES');
  counts.orphanAliasRows = aliasOrphans.orphans;
  counts.orphanAttributeRows = attrOrphans.orphans;

  const now = new Date().toISOString();
  const out = [];
  out.push(['CLEAN_ITEMS readiness audit', now, '', '']);
  out.push(['', '', '', '']);
  out.push(['### Header checks', '', '', '']);
  out.push(['HeaderKey', 'Status', '', '']);
  headerChecks.forEach((r) => out.push([r[0], r[1], '', '']));
  out.push(['', '', '', '']);
  out.push(['### Summary (active rows)', '', '', '']);
  out.push(['ActiveRows', counts.active, '', '']);
  out.push(['Missing ImageURL', counts.missingImage, '', '']);
  out.push(['Missing Manufacturer', counts.missingMfr, '', '']);
  out.push(['Missing Model/Series', counts.missingModelSeries, '', '']);
  out.push(['Missing BaseMaterialCost', counts.missingMaterial, '', '']);
  out.push(['Missing BaseLaborMinutes', counts.missingLabor, '', '']);
  out.push(['Missing Description', counts.missingDescription, '', '']);
  out.push(['Missing Category', counts.missingCategory, '', '']);
  out.push(['Orphaned ALIASES rows (Canonical_SKU not in CLEAN_ITEMS)', counts.orphanAliasRows, '', '']);
  out.push(['Orphaned ATTRIBUTES rows (Canonical_SKU not in CLEAN_ITEMS)', counts.orphanAttributeRows, '', '']);
  out.push(['', '', '', '']);

  const readiness =
    missingHeaders.length === 0 && counts.orphanAliasRows === 0 && counts.orphanAttributeRows === 0 ? 'CUTOVER_READY' : 'NOT_READY';
  out.push(['### Readiness', readiness, '', '']);
  if (missingHeaders.length) out.push(['MissingHeaders', missingHeaders.join(', '), '', '']);
  if (aliasOrphans.missingExamples.length) out.push(['AliasOrphanExamples', aliasOrphans.missingExamples.join(', '), '', '']);
  if (attrOrphans.missingExamples.length) out.push(['AttributeOrphanExamples', attrOrphans.missingExamples.join(', '), '', '']);
  out.push(['', '', '', '']);

  out.push(['### Category breakdown (active rows)', '', '', '']);
  out.push(['Category', 'Active', 'Missing ImageURL', 'Missing Mfr / Model / Cost / Labor']);

  const cats = Object.keys(perCategory);
  cats.sort((a, b) => (perCategory[b].missingImage - perCategory[a].missingImage) || (perCategory[b].active - perCategory[a].active));
  cats.slice(0, 60).forEach((c) => {
    const v = perCategory[c];
    const combined = `Mfr:${v.missingMfr} · Model/Series:${v.missingModelSeries} · Cost:${v.missingMaterial} · Labor:${v.missingLabor}`;
    out.push([c, v.active, v.missingImage, combined]);
  });

  meta.getRange(1, 1, out.length, 4).setValues(out);
  meta.setFrozenRows(0);
  meta.autoResizeColumns(1, 4);

  catalogRefreshSyncReadme();
  SpreadsheetApp.getUi().alert(
    `Audit complete.\n\nActive rows: ${counts.active}\nMissing ImageURL: ${counts.missingImage}\nMissing Manufacturer: ${counts.missingMfr}\nMissing Model/Series: ${counts.missingModelSeries}\nOrphaned aliases: ${counts.orphanAliasRows}\nOrphaned attributes: ${counts.orphanAttributeRows}\n\nSee META tab for full breakdown.`
  );
}

function buildSkuToRowMap_(values, headers) {
  const idx = headerIndexMap_(headers);
  const skuIdx = idx['sku'] != null ? idx['sku'] : null;
  if (skuIdx == null) return { skuIdx: null, map: {} };
  const map = {};
  values.slice(1).forEach((r) => {
    const sku = String(cell_(r, skuIdx) || '').trim();
    if (!sku) return;
    if (!map[sku]) map[sku] = r;
  });
  return { skuIdx, map };
}

function readCanonicalSkusFromSheet_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return { sheet: null, values: [], headers: [], canonIdx: null, activeIdx: null, rows: [] };
  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { sheet: sh, values, headers: [], canonIdx: null, activeIdx: null, rows: [] };
  const headers = values[0].map((v) => String(v || '').trim());
  const idx = headerIndexMap_(headers);
  const canonIdx = idx['canonical sku'] != null ? idx['canonical sku'] : idx['canonical_sku'] != null ? idx['canonical_sku'] : idx['sku'] != null ? idx['sku'] : null;
  const activeIdx = idx['active'] != null ? idx['active'] : null;
  const rows = values.slice(1);
  return { sheet: sh, values, headers, canonIdx, activeIdx, rows };
}

function deactivateOrphanRows_(sheetInfo, orphanSkus, reasonTag) {
  const { sheet, values, headers, canonIdx, activeIdx } = sheetInfo;
  if (!sheet) return 0;
  if (canonIdx == null) return 0;
  if (activeIdx == null) return 0;
  const idx = headerIndexMap_(headers);
  const notesIdx = idx['notes'] != null ? idx['notes'] : null;

  let changed = 0;
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const canon = String(cell_(r, canonIdx) || '').trim();
    if (!canon) continue;
    if (!orphanSkus.has(canon)) continue;
    if (!truthy_(cell_(r, activeIdx))) continue;
    // Set Active=false
    sheet.getRange(i + 1, activeIdx + 1).setValue(false);
    if (notesIdx != null) {
      const prev = String(cell_(r, notesIdx) || '').trim();
      const next = prev ? `${prev} | ${reasonTag}` : reasonTag;
      sheet.getRange(i + 1, notesIdx + 1).setValue(next);
    }
    changed += 1;
  }
  return changed;
}

/**
 * Fixes the two main cutover blockers:
 * - CLEAN_ITEMS header mismatch (e.g. missing SKU/Unit)
 * - Orphaned ALIASES/ATTRIBUTES rows referencing Canonical_SKU not present in CLEAN_ITEMS
 *
 * Strategy:
 * 1) Repair/append CLEAN_ITEMS headers to match HEADERS.ITEMS (non-destructive; no column reordering).
 * 2) Restore missing canonical rows into CLEAN_ITEMS by copying matching SKU rows from ITEMS (as inactive).
 * 3) If any orphan Canonical_SKU still cannot be restored (not found in ITEMS), prompt to deactivate those orphan rows (do not delete).
 */
function catalogFixCleanItemsCutoverBlockers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const clean = ss.getSheetByName('CLEAN_ITEMS');
  const items = ss.getSheetByName('ITEMS');
  if (!clean) throw new Error('CLEAN_ITEMS tab not found.');
  if (!items) throw new Error('ITEMS tab not found.');

  // Step 1: Header repair on CLEAN_ITEMS to canonical expected headers
  repairHeaderRowBySynonyms_(clean, HEADERS.ITEMS);

  // Refresh values after header repair
  const cleanValues = clean.getDataRange().getValues();
  if (!cleanValues || cleanValues.length < 2) {
    ui.alert('CLEAN_ITEMS has no data rows. Header repaired, but there is nothing to reconcile.');
    return;
  }
  const cleanHeaders = cleanValues[0].map((v) => String(v || '').trim());
  const cleanIdx = headerIndexMap_(cleanHeaders);
  const cleanSkuIdx = cleanIdx['sku'] != null ? cleanIdx['sku'] : null;
  if (cleanSkuIdx == null) {
    ui.alert('Header repair failed to create/locate SKU column in CLEAN_ITEMS. Please check the header row manually.');
    return;
  }

  // Current SKUs in CLEAN_ITEMS (all rows, active or not)
  const cleanSkus = new Set(
    cleanValues
      .slice(1)
      .map((r) => String(cell_(r, cleanSkuIdx) || '').trim())
      .filter((s) => s)
  );

  // Read referenced Canonical_SKU from ALIASES and ATTRIBUTES (active rows only)
  const aliasesInfo = readCanonicalSkusFromSheet_('ALIASES');
  const attrsInfo = readCanonicalSkusFromSheet_('ATTRIBUTES');

  const referenced = new Set();
  const addReferencedFrom = (info) => {
    if (!info.sheet) return;
    if (info.canonIdx == null) return;
    info.values.slice(1).forEach((r) => {
      const canon = String(cell_(r, info.canonIdx) || '').trim();
      if (!canon) return;
      if (info.activeIdx != null && !truthy_(cell_(r, info.activeIdx))) return;
      referenced.add(canon);
    });
  };
  addReferencedFrom(aliasesInfo);
  addReferencedFrom(attrsInfo);

  const orphaned = new Set(Array.from(referenced).filter((sku) => !cleanSkus.has(sku)));

  // Step 2: Restore missing canonicals by copying rows from ITEMS
  const itemsValues = items.getDataRange().getValues();
  if (!itemsValues || itemsValues.length < 2) throw new Error('ITEMS appears empty; cannot restore missing canonicals.');
  const itemsHeaders = itemsValues[0].map((v) => String(v || '').trim());
  const { map: itemsBySku } = buildSkuToRowMap_(itemsValues, itemsHeaders);

  const toRestore = [];
  const stillOrphaned = new Set();
  orphaned.forEach((sku) => {
    const row = itemsBySku[sku];
    if (row) {
      toRestore.push(row);
    } else {
      stillOrphaned.add(sku);
    }
  });

  let restoredCount = 0;
  if (toRestore.length) {
    // Ensure CLEAN_ITEMS has at least as many columns as headers we want to write
    const cleanCols = Math.max(1, clean.getLastColumn());
    const neededCols = Math.max(cleanCols, itemsHeaders.length);
    if (neededCols > cleanCols) {
      clean.insertColumnsAfter(cleanCols, neededCols - cleanCols);
    }
    // Write any missing headers from ITEMS (append-only; no reorder)
    repairHeaderRowBySynonyms_(clean, itemsHeaders);

    // Recompute indexes after potential header append
    const cleanHeaders2 = clean.getRange(1, 1, 1, clean.getLastColumn()).getValues()[0].map((v) => String(v || '').trim());
    const cleanIdx2 = headerIndexMap_(cleanHeaders2);
    const skuIdx2 = cleanIdx2['sku'] != null ? cleanIdx2['sku'] : null;
    const activeIdx2 = cleanIdx2['active'] != null ? cleanIdx2['active'] : null;

    // Append rows, but mark them inactive in CLEAN_ITEMS to avoid surfacing junk forward-facing.
    const rowsToAppend = toRestore.map((r) => r.slice());
    if (activeIdx2 != null) {
      rowsToAppend.forEach((r) => {
        r[activeIdx2] = false;
      });
    }

    const startRow = clean.getLastRow() + 1;
    const n = clean.getLastColumn();
    clean.getRange(startRow, 1, rowsToAppend.length, n).setValues(
      rowsToAppend.map((r) => {
        // pad row to current col count
        const out = [];
        for (let i = 0; i < n; i++) out.push(r[i] != null ? r[i] : '');
        return out;
      })
    );
    restoredCount = rowsToAppend.length;
  }

  // Step 3: If still orphaned, offer to deactivate those rows (do not delete)
  let deactivatedAliases = 0;
  let deactivatedAttrs = 0;
  if (stillOrphaned.size) {
    const example = Array.from(stillOrphaned).slice(0, 10).join(', ');
    const prompt = ui.prompt(
      'Unresolvable orphans detected',
      `After restoring from ITEMS, some Canonical_SKU values are still missing from ITEMS and CLEAN_ITEMS.\n\nCount: ${stillOrphaned.size}\nExamples: ${example}\n\nTo keep cutover safe, you can deactivate these orphan rows in ALIASES/ATTRIBUTES (no deletes).\n\nType DEACTIVATE to proceed, or Cancel to leave them active and NOT_READY.`,
      ui.ButtonSet.OK_CANCEL
    );
    if (prompt.getSelectedButton() === ui.Button.OK && String(prompt.getResponseText() || '').trim() === 'DEACTIVATE') {
      const tag = `AUTO_DEACTIVATED_ORPHAN_NO_ITEM @ ${new Date().toISOString()}`;
      deactivatedAliases = deactivateOrphanRows_(aliasesInfo, stillOrphaned, tag);
      deactivatedAttrs = deactivateOrphanRows_(attrsInfo, stillOrphaned, tag);
    }
  }

  // Always rewrite readme and run audit so META reflects the new state
  catalogRefreshSyncReadme();
  catalogAuditCleanItemsReadiness();

  ui.alert(
    `Cutover blocker fix complete.\n\nHeader repair: CLEAN_ITEMS headers normalized/augmented.\nRestored missing canonicals into CLEAN_ITEMS (inactive): ${restoredCount}\nDeactivated orphan ALIASES rows: ${deactivatedAliases}\nDeactivated orphan ATTRIBUTES rows: ${deactivatedAttrs}\n\nRe-check META for updated readiness + breakdown.`
  );
}

/**
 * Generate a lightweight RESEARCH_QUEUE from gaps in ITEMS.
 * This is intentionally conservative and non-destructive.
 */
function catalogGenerateResearchQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const items = ss.getSheetByName('ITEMS');
  if (!items) throw new Error('ITEMS tab not found.');

  const values = items.getDataRange().getValues();
  if (!values || values.length < 2) return;
  const headers = values[0].map((v) => String(v || '').trim());
  const idx = headerIndexMap_(headers);
  const skuIdx = idx['sku'] != null ? idx['sku'] : null;
  const catIdx = idx['category'] != null ? idx['category'] : null;
  const descIdx = idx['description'] != null ? idx['description'] : null;
  const mfrIdx = idx['manufacturer'] != null ? idx['manufacturer'] : null;
  const modelIdx = idx['model'] != null ? idx['model'] : null;
  const seriesIdx = idx['series'] != null ? idx['series'] : null;
  const genericIdx = idx['genericitemname'] != null ? idx['genericitemname'] : null;
  const imageIdx = idx['imageurl'] != null ? idx['imageurl'] : null;
  const matIdx = idx['basematerialcost'] != null ? idx['basematerialcost'] : null;
  const laborIdx = idx['baselaborminutes'] != null ? idx['baselaborminutes'] : null;
  const activeIdx = idx['active'] != null ? idx['active'] : null;

  const research = getOrCreateSheet_(ss, 'RESEARCH_QUEUE');
  const rqHeaders = ['CreatedAt', 'Kind', 'SKU', 'Issue', 'Notes'];
  const firstRow = research.getRange(1, 1, 1, rqHeaders.length).getValues()[0];
  const hasAny = firstRow.some((v) => String(v || '').trim());
  if (!hasAny) ensureHeaderRow_(research, rqHeaders);

  const out = [];
  const rows = values.slice(1);
  rows.forEach((r) => {
    const sku = skuIdx == null ? '' : String(cell_(r, skuIdx) || '').trim();
    if (!sku) return;
    if (activeIdx != null && !truthy_(cell_(r, activeIdx))) return;

    const category = catIdx == null ? '' : String(cell_(r, catIdx) || '').trim();
    const description = descIdx == null ? '' : String(cell_(r, descIdx) || '').trim();
    const model = modelIdx == null ? '' : String(cell_(r, modelIdx) || '').trim();
    const series = seriesIdx == null ? '' : String(cell_(r, seriesIdx) || '').trim();
    const genericName = genericIdx == null ? '' : String(cell_(r, genericIdx) || '').trim();
    const imageUrl = imageIdx == null ? '' : String(cell_(r, imageIdx) || '').trim();

    const issues = [];
    if (catIdx != null && !String(cell_(r, catIdx) || '').trim()) issues.push('Missing Category');
    if (descIdx != null && !String(cell_(r, descIdx) || '').trim()) issues.push('Missing Description');
    if (mfrIdx != null && !String(cell_(r, mfrIdx) || '').trim()) issues.push('Missing Manufacturer');
    if (modelIdx != null && !model && !series) issues.push('Missing Model/Series');
    if (imageIdx != null && !imageUrl) issues.push('Missing ImageURL');
    if (/^generic[-_]/i.test(sku) || /^gen[-_]/i.test(sku)) issues.push('SKU looks generic (prefer manufacturer-backed SKU where possible)');
    if (genericIdx != null && !genericName) issues.push('Missing GenericItemName (useful for parsing and governance)');
    if (matIdx != null && String(cell_(r, matIdx) || '').trim() === '') issues.push('Missing BaseMaterialCost');
    if (laborIdx != null && String(cell_(r, laborIdx) || '').trim() === '') issues.push('Missing BaseLaborMinutes');
    if (!issues.length) return;

    const context = [category, description].filter(Boolean).join(' — ');
    out.push([new Date().toISOString(), 'item_gap', sku, issues.join(' • '), context]);
  });

  // Append; do not clear historical research notes.
  if (out.length) {
    const startRow = Math.max(2, research.getLastRow() + 1);
    const numCols = Math.max(rqHeaders.length, research.getLastColumn());
    const padded = out.map((line) => {
      const row = line.slice();
      while (row.length < numCols) row.push('');
      return row;
    });
    research.getRange(startRow, 1, padded.length, numCols).setValues(padded);
  }

  catalogRefreshSyncReadme();
}

/**
 * Generate a focused missing-images worklist from CLEAN_ITEMS (preferred) or ITEMS (fallback).
 * Output is appended into RESEARCH_QUEUE as Kind=missing_image, so it can be filtered/copied/exported easily.
 */
function catalogGenerateMissingImagesWorklist() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = ss.getSheetByName('CLEAN_ITEMS') || ss.getSheetByName('ITEMS');
  if (!source) throw new Error('Neither CLEAN_ITEMS nor ITEMS tab found.');

  const values = source.getDataRange().getValues();
  if (!values || values.length < 2) return;
  const headers = values[0].map((v) => String(v || '').trim());
  const idx = headerIndexMap_(headers);

  const skuIdx = idx['sku'] != null ? idx['sku'] : null;
  const catIdx = idx['category'] != null ? idx['category'] : null;
  const descIdx = idx['description'] != null ? idx['description'] : null;
  const mfrIdx = idx['manufacturer'] != null ? idx['manufacturer'] : null;
  const modelIdx = idx['model'] != null ? idx['model'] : null;
  const seriesIdx = idx['series'] != null ? idx['series'] : null;
  const imageIdx = idx['imageurl'] != null ? idx['imageurl'] : null;
  const activeIdx = idx['active'] != null ? idx['active'] : null;
  const depIdx = idx['deprecated'] != null ? idx['deprecated'] : null;
  const isCanonIdx = idx['iscanonical'] != null ? idx['iscanonical'] : null;

  const research = getOrCreateSheet_(ss, 'RESEARCH_QUEUE');
  const rqHeaders = [
    'CreatedAt',
    'Kind',
    'SKU',
    'Issue',
    'Notes',
    'PriorityScore',
    'CategoryGapPct',
    'ManufacturerBacked',
    'ForwardCanonical',
  ];
  const colCount = ensureResearchQueueMinColumns_(research, rqHeaders.length, rqHeaders);

  const out = [];
  const rows = values.slice(1);
  // Precompute category gap severity: missing images / active rows.
  const catTotals = {};
  const catMissing = {};
  rows.forEach((r) => {
    if (activeIdx != null && !truthy_(cell_(r, activeIdx))) return;
    if (readOptionalBoolGs_(r, depIdx, false)) return;
    if (isCanonIdx != null && !readOptionalBoolGs_(r, isCanonIdx, true)) return;

    const category = catIdx == null ? '' : String(cell_(r, catIdx) || '').trim();
    const key = category || '(Uncategorized)';
    catTotals[key] = (catTotals[key] || 0) + 1;
    const imageUrl = imageIdx == null ? '' : String(cell_(r, imageIdx) || '').trim();
    if (!imageUrl) catMissing[key] = (catMissing[key] || 0) + 1;
  });

  const candidates = [];
  rows.forEach((r) => {
    const sku = skuIdx == null ? '' : String(cell_(r, skuIdx) || '').trim();
    if (!sku) return;
    if (activeIdx != null && !truthy_(cell_(r, activeIdx))) return;
    if (readOptionalBoolGs_(r, depIdx, false)) return;

    const forwardCanonical = isCanonIdx == null ? true : readOptionalBoolGs_(r, isCanonIdx, true);
    if (!forwardCanonical) return;

    const imageUrl = imageIdx == null ? '' : String(cell_(r, imageIdx) || '').trim();
    if (imageUrl) return;

    const category = catIdx == null ? '' : String(cell_(r, catIdx) || '').trim();
    const manufacturer = mfrIdx == null ? '' : String(cell_(r, mfrIdx) || '').trim();
    const model = modelIdx == null ? '' : String(cell_(r, modelIdx) || '').trim();
    const series = seriesIdx == null ? '' : String(cell_(r, seriesIdx) || '').trim();
    const description = descIdx == null ? '' : String(cell_(r, descIdx) || '').trim();
    const context = [category, manufacturer, series || model, description].filter(Boolean).join(' — ');

    const key = category || '(Uncategorized)';
    const total = catTotals[key] || 1;
    const miss = catMissing[key] || 0;
    const gapPct = Math.round((miss / total) * 100);
    const manufacturerBacked = Boolean(manufacturer && (model || series));
    const genericSku = looksGenericSku_(sku);

    let score = gapPct;
    score += manufacturerBacked ? 45 : 0;
    score += forwardCanonical ? 20 : 0;
    if (genericSku) score -= 40;
    if (!manufacturer) score -= 12;
    if (!(model || series)) score -= 8;

    const issue = `Missing ImageURL · score=${score} · ${String(gapPct).padStart(3, '0')}% cat gap · ${manufacturerBacked ? 'mfr-backed' : 'needs mfr/model'} · ${key}`;

    candidates.push({
      sku,
      score,
      gapPct,
      manufacturerBacked: manufacturerBacked ? 'yes' : 'no',
      forwardCanonical: forwardCanonical ? 'yes' : 'no',
      row: [
        new Date().toISOString(),
        'missing_image',
        sku,
        issue,
        context,
        score,
        gapPct,
        manufacturerBacked ? 'yes' : 'no',
        forwardCanonical ? 'yes' : 'no',
      ],
    });
  });

  candidates.sort((a, b) => (b.score - a.score) || (b.gapPct - a.gapPct) || a.sku.localeCompare(b.sku));

  candidates.forEach((c) => out.push(c.row));

  if (out.length) {
    const startRow = Math.max(2, research.getLastRow() + 1);
    research.getRange(startRow, 1, out.length, colCount).setValues(
      out.map((line) => {
        const padded = line.slice();
        while (padded.length < colCount) padded.push('');
        return padded;
      })
    );
  }

  const topCategories = Object.keys(catMissing)
    .map((name) => {
      const active = catTotals[name] || 0;
      const missing = catMissing[name] || 0;
      const pct = active > 0 ? Math.round((missing / active) * 100) : 0;
      return { name, active, missing, pct };
    })
    .sort((a, b) => b.missing - a.missing || b.pct - a.pct)
    .slice(0, 10);

  const topSkus = candidates.slice(0, 20).map((c) => ({
    sku: c.sku,
    score: String(c.score),
    gapPct: String(c.gapPct),
    mfrBacked: c.manufacturerBacked,
  }));

  appendMetaImagePriorityBlock_(ss, {
    sourceName: source.getName(),
    queued: out.length,
    topCategories,
    topSkus,
  });

  catalogRefreshSyncReadme();

  ui.alert(
    `Missing-images worklist appended: ${out.length} row(s).\n\nPriority uses category gap %, manufacturer-backed rows, canonical forward rows, and deprioritizes generic SKUs.\nExtended columns were added to RESEARCH_QUEUE.\nA summary block was appended under META (audit preserved).`
  );
}

/**
 * Main entrypoint: clean up tab clutter and rewrite SYNC_README.
 */
function catalogSyncCleanup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1) Unify naming conventions (rename duplicates into canonical names when safe).
  TAB_CANONICAL_ALIASES.forEach(({ from, to }) => {
    safeRenameSheet_(ss, from, to);
  });

  // 2) Delete known duplicate tabs we no longer want (if they still exist).
  TAB_DELETIONS.forEach((name) => deleteSheetIfExists_(ss, name));

  // 3) Ensure required tabs exist (do not destroy their content).
  DESIRED_TABS.forEach((name) => getOrCreateSheet_(ss, name));

  // 4) Optional preserved tabs: leave them if present, do not create them.
  OPTIONAL_TABS_PRESERVED.forEach((name) => {
    // no-op: do not generate; keep if it exists.
  });

  // 5) Document purposes in SYNC_README.
  writeSyncReadme_(ss);

  // 6) Keep headers sane on key governance tabs (safe to enforce).
  // We intentionally do not force-overwrite ITEMS/MODIFIERS/BUNDLES headers unless they are empty/missing.
  // (If you want strict enforcement, flip this to always set headers.)
  const maybeEnsure = (tab, headers) => {
    const sh = ss.getSheetByName(tab);
    if (!sh) return;
    const firstRow = sh.getRange(1, 1, 1, Math.max(1, headers.length)).getValues()[0];
    const hasAny = firstRow.some((v) => String(v || '').trim());
    if (!hasAny) ensureHeaderRow_(sh, headers);
  };
  maybeEnsure('ITEMS', HEADERS.ITEMS);
  maybeEnsure('MODIFIERS', HEADERS.MODIFIERS);
  maybeEnsure('BUNDLES', HEADERS.BUNDLES);
  maybeEnsure('ALIASES', HEADERS.ALIASES);
  maybeEnsure('ATTRIBUTES', HEADERS.ATTRIBUTES);

  // 7) Reorder tabs into the desired layout (append any unknown tabs after).
  const seen = new Set();
  DESIRED_TABS.forEach((name) => {
    moveSheetToEnd_(ss, name);
    seen.add(name);
  });
  OPTIONAL_TABS_PRESERVED.forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (sh) {
      moveSheetToEnd_(ss, name);
      seen.add(name);
    }
  });
}

