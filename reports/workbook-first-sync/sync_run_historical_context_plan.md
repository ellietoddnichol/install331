# Catalog sync runs — historical workbook / env context

## Goal

Each `catalog_sync_runs_v1` attempt (success, failed after preflight, failed mid-flight, takeoff-registry backfill) stores a JSON document describing **which workbook and importer settings were in effect when the row was inserted**, independent of future server `.env` changes.

## Persistence

| Column              | Type | Notes |
|---------------------|------|-------|
| `run_context_json`  | TEXT, nullable | JSON object `CatalogSyncRunContext`; null for legacy rows. |

`warnings_json` remains the structured audit + flat warnings carrier; unchanged for backward compatibility.

### `CatalogSyncRunContext` shape (schema v1)

- **Identity:** `schemaVersion` (= 1), `runKind` (`catalog_full_sync` \| `takeoff_registry_backfill`), `recordedAtIso`
- **Workbook:** `spreadsheetId`, `spreadsheetIdConfigured`, `tabs` (`itemsConfigured`, `itemsFetch`, `cleanItemsTabEnv`, modifiers / bundles / aliases / attributes tab names), `itemsFetchOverridesConfiguredItemsTab`
- **`importEnv`:** legacy flag, replace mode, skip staging import rows, raw `catalogSyncItemsSource`, `stagingTabImportsByEnv` (map of each `CATALOG_SYNC_IMPORT_*` env → boolean)
- **`validation`:** raw `publishBlockersAllowedCategories` string, `catalogSyncReviewMaxSamples`, `preflightMaxBlockingIssues`

Captured by `buildCatalogSyncRunContextRecord()` at sync start (`googleSheetsCatalogSync.ts`). Uses env-only peek (no Sheets API calls) so failed runs still get context.

## Versioning

- Bump `CATALOG_SYNC_RUN_CONTEXT_SCHEMA_VERSION` and extend the object shape for non-breaking additive fields whenever possible.
- `parseCatalogSyncRunContextJson()` rejects unknown schema versions → API returns null `historicalSyncRunContext` and falls back workbook display to **current server env**.

## Rollback

- Postgres: optional `ALTER TABLE catalog_sync_runs_v1 DROP COLUMN IF EXISTS run_context_json;` (loses persisted history only — do not drop `warnings_json`).
- SQLite: no automatic down-migration in-app; safest leave column unused.
- Deploy rollback: omit new migration apply; inserts must omit column (nullable — compatible with servers that never added the migration if column missing: ensure migration applied before relying on inserts that reference the column).

## API behavior (summary)

- **`serverConfigNow`:** always live env snapshot (`buildCatalogSyncServerConfigNow()`).
- **`workbook`:** derived from parsed `run_context_json` when present (per history row, or “latest run” for status); else from current env.
- **`historicalSyncRunContext`:** parsed document or null.

See `reports/workbook-first-sync/IMPLEMENTATION_DELTA.md` for file-level detail.
