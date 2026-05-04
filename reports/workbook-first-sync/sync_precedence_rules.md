# Sync precedence rules (workbook → database)

Source: `src/server/services/googleSheetsCatalogSync.ts` — `syncCatalogFromGoogleSheets()`, `getSpreadsheetConfig()`, `resolveConfiguredAndFetchItemsTabs()`.

## Tab → database targets

| Workbook tab (env override) | Env variable | Default tab name | Primary DB writes |
|----------------------------|--------------|------------------|-------------------|
| Items | `GOOGLE_SHEETS_TAB_ITEMS` | `CLEAN_ITEMS` | `catalog_items` (physical table via `getCatalogItemsWriteTableName()`) |
| Clean items (authoritative range when `TAB_ITEMS` is legacy `ITEMS`) | `GOOGLE_SHEETS_TAB_CLEAN_ITEMS` | `CLEAN_ITEMS` | *(same as items — controls **which range** is read for upserts when redirecting off `ITEMS`)* |
| Modifiers | `GOOGLE_SHEETS_TAB_MODIFIERS` | `MODIFIERS` | `modifiers_v1` |
| Bundles | `GOOGLE_SHEETS_TAB_BUNDLES` | `BUNDLES` | `bundles_v1`, `bundle_items_v1` |
| Aliases | `GOOGLE_SHEETS_TAB_ALIASES` | `ALIASES` | `catalog_item_aliases` |
| Attributes | `GOOGLE_SHEETS_TAB_ATTRIBUTES` | `ATTRIBUTES` | `catalog_item_attributes` |

Optional staging: when `CATALOG_SYNC_SKIP_STAGING` is **not** `1`, each processed items row is also logged to **`catalog_sheet_import_rows`** (raw cells JSON, batch id, tab name).

## Authoritative vs staging semantics (enforced)

1. **Curated publish tabs:** `CLEAN_ITEMS`, `MODIFIERS`, `BUNDLES`, `ALIASES`, `ATTRIBUTES` (names configurable via env; defaults above) drive published relational data in the sync transaction.

2. **Legacy `ITEMS` vs `CLEAN_ITEMS` (non-breaking default):**
   - If `GOOGLE_SHEETS_TAB_ITEMS` is literally **`ITEMS`** (case-insensitive trim) **and** `CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB` is **unset**, sync **does not** ingest the `ITEMS` range for item upserts. It reads **`GOOGLE_SHEETS_TAB_CLEAN_ITEMS`** (default `CLEAN_ITEMS`) instead.
   - Set **`CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB=1`** to force reading the **`ITEMS`** tab for item upserts when `GOOGLE_SHEETS_TAB_ITEMS=ITEMS`.
   - If `GOOGLE_SHEETS_TAB_ITEMS` already names **`CLEAN_ITEMS`**, behavior matches the previous default (authoritative clean surface).

3. **`CATALOG_SYNC_ITEMS_SOURCE` (optional signal):** `clean` / `clean_only` can be set to document operator intent that the clean workbook is authoritative; when `TAB_ITEMS` still names `ITEMS`, a warning may reference this flag. Resolution is unchanged except as in (2).

4. **Staging-only workbook tabs** (`RECOMMENDED_ITEMS`, `LEGACY_ITEMS`, `RESEARCH_QUEUE`, `CATEGORY_PLAN`, `META`, `SYNC_README`, `DEFAULT_ITEMS`):
   - They are **not** read automatically. If any **`GOOGLE_SHEETS_TAB_*`** points at one of these names, sync **throws** unless the matching import flag is set (see below).
   - **Exception:** `GOOGLE_SHEETS_TAB_ITEMS=ITEMS` uses the legacy / clean redirect rules in (2), not the staging import map.

5. **Per-tab staging import flags** (set to `1` / `true` / `yes` only if you intentionally wire a staging tab into that env slot):

   | Tab name | Env |
   |----------|-----|
   | `RECOMMENDED_ITEMS` | `CATALOG_SYNC_IMPORT_RECOMMENDED_ITEMS` |
   | `LEGACY_ITEMS` | `CATALOG_SYNC_IMPORT_LEGACY_ITEMS` |
   | `RESEARCH_QUEUE` | `CATALOG_SYNC_IMPORT_RESEARCH_QUEUE` |
   | `CATEGORY_PLAN` | `CATALOG_SYNC_IMPORT_CATEGORY_PLAN` |
   | `META` | `CATALOG_SYNC_IMPORT_META` |
   | `SYNC_README` | `CATALOG_SYNC_IMPORT_SYNC_README` |
   | `DEFAULT_ITEMS` | `CATALOG_SYNC_IMPORT_DEFAULT_ITEMS` |

6. **Non-items roles must not use `ITEMS`:** `GOOGLE_SHEETS_TAB_MODIFIERS`, `…_BUNDLES`, `…_ALIASES`, `…_ATTRIBUTES` **must not** point at the literal **`ITEMS`** tab.

7. **Console visibility:** On each sync, the server logs `[catalog-sync] skipped tab <NAME> (staging)` for the fixed staging list, and an extra line when legacy **`ITEMS`** is skipped in favor of the clean tab.

8. **Transaction order:** items → modifiers → bundles (bundle lines resolve SKUs against the **write** `catalog_items` table after item upserts) → aliases → attributes. Aliases/attributes tabs are optional (warnings only if missing).

## Reads vs writes (Postgres)

Estimator / app reads use `*_clean` views when configured; sync **writes** remain on base tables. No destructive delete in this path.
