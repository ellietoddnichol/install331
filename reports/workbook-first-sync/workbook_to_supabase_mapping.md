# Workbook → Supabase mapping (current vs proposed)

This note audits **`src/server/services/googleSheetsCatalogSync.ts`** and related env/config. Official coordination doc: **`docs/catalog-sync-architecture.md`**.

## Current sheet → table mapping (as implemented)

| Workbook tab (env default) | Env var(s) | Sync function | Target table(s) | Notes |
| --- | --- | --- | --- | --- |
| **`CLEAN_ITEMS`** (default) | `GOOGLE_SHEETS_TAB_ITEMS` | `upsertItems` | **`catalog_items`** via `getCatalogItemsWriteTableName()` | Same code path as legacy **ITEMS** tab; tab name is configurable. Staging: **`catalog_sheet_import_rows`** per row (unless `CATALOG_SYNC_SKIP_STAGING=1`). |
| **`MODIFIERS`** | `GOOGLE_SHEETS_TAB_MODIFIERS` | `upsertModifiers` | **`modifiers_v1`** | Keys normalized to `modifier_key`; merge vs full replace controlled by `CATALOG_SYNC_REPLACE_MODE`. |
| **`BUNDLES`** | `GOOGLE_SHEETS_TAB_BUNDLES` | `upsertBundles` | **`bundles_v1`**, **`bundle_items_v1`** | Bundle header upserted; **`bundle_items_v1` rows for a bundle are deleted then re-inserted** each sync (scoped per `bundle_id`, not a global truncate). |
| **`ALIASES`** (optional) | `GOOGLE_SHEETS_TAB_ALIASES` | `upsertAliases` | **`catalog_item_aliases`** | Resolves **Canonical_SKU** → `catalog_items.id` via `writeTable` (same physical table as items). Inactive sheet rows skipped (no deletes). |
| **`ATTRIBUTES`** (optional) | `GOOGLE_SHEETS_TAB_ATTRIBUTES` | `upsertAttributes` | **`catalog_item_attributes`** | Same SKU resolution; `ON CONFLICT` upsert on `(catalog_item_id, attribute_type, attribute_value)`. |

**Sync orchestration:** `syncCatalogFromGoogleSheets()` requires **items, modifiers, bundles** tabs to exist; **aliases** and **attributes** are optional (warnings if missing).

**Status / audit tables (not sheet-backed):**

- **`catalog_sync_status_v1`**, **`catalog_sync_runs_v1`** — last run message, counts, warnings JSON.

### Tab name environment variables

| Variable | Default |
| --- | --- |
| `GOOGLE_SHEETS_SPREADSHEET_ID` or `GOOGLE_SHEETS_ID` | Hardcoded fallback id in code if unset (operators should set env in prod). |
| `GOOGLE_SHEETS_TAB_ITEMS` | `CLEAN_ITEMS` |
| `GOOGLE_SHEETS_TAB_MODIFIERS` | `MODIFIERS` |
| `GOOGLE_SHEETS_TAB_BUNDLES` | `BUNDLES` |
| `GOOGLE_SHEETS_TAB_ALIASES` | `ALIASES` |
| `GOOGLE_SHEETS_TAB_ATTRIBUTES` | `ATTRIBUTES` |

Also used for **write-back** helpers: `upsertItemInGoogleSheet`, `upsertModifierInGoogleSheet`, `upsertBundleInGoogleSheet` (same `getSpreadsheetConfig()`).

### CLEAN_ITEMS path vs legacy ITEMS path

There is **no separate code path**: `upsertItems` is identical regardless of tab name. **`GOOGLE_SHEETS_TAB_ITEMS=CLEAN_ITEMS`** (default) vs **`=ITEMS`** only changes **which range** is fetched. Column detection is **header-driven** (many aliases per logical field — SKU, Category, Material cost, Labor minutes, etc.). Governance is operational: **production** should point env only at curated tabs (`CLEAN_ITEMS` + canonical modifier/bundle/alias/attribute tabs).

### Runtime reads (estimator / API)

- **Catalog items:** `getCatalogItemsTableName()` / `getCatalogItemsReadTableName()` in **`src/server/db/catalogTable.ts`** — Postgres default **`catalog_items_clean`** (view over `catalog_items`); SQLite **`catalog_items`**. Override: **`CATALOG_ITEMS_TABLE`** ∈ `{ catalog_items, catalog_items_clean }`.
- **Modifiers / bundles / aliases / attributes:** code reads **base tables** (`modifiers_v1`, `bundles_v1`, `bundle_items_v1`, `catalog_item_aliases`, `catalog_item_attributes`) — see **`guarded_sync_plan.md`** for a published-layer direction.

## Proposed mapping (workbook-first governance)

| Governance tier | Tabs | Action |
| --- | --- | --- |
| **Authoritative for production publish** | `CLEAN_ITEMS`, `ALIASES`, `ATTRIBUTES`, `MODIFIERS`, `BUNDLES` | Keep env defaults; validate before promote; sync writes remain **staged → validated → published** (see `guarded_sync_plan.md`). |
| **Non-authoritative / staging** | `ITEMS`, `RECOMMENDED_ITEMS`, `LEGACY_ITEMS`, `RESEARCH_QUEUE`, `CATEGORY_PLAN`, `META`, `SYNC_README`, `DEFAULT_ITEMS` | **Do not** point `GOOGLE_SHEETS_TAB_*` at these for prod sync; use for research/planning only unless explicitly promoting a cutover. |

**Bundle definitions:** The codebase uses a **single BUNDLES tab** with inline **Included SKUs** and **Included Modifiers** lists; there is **no separate “bundle_items” sheet**. Normalized storage remains **`bundles_v1` + `bundle_items_v1`**.

---

*Generated as part of the workbook-first sync audit (`reports/workbook-first-sync/`).*
