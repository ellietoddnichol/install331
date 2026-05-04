# Sync run report design (structured audit + `warnings_json`)

## Goals

- Add a **structured** per-run summary for workbook-first catalog sync **without** breaking existing consumers that expect `warnings_json` to parse as a **JSON array of strings**.
- Avoid new required DB columns; reuse `catalog_sync_status_v1.warnings_json` and `catalog_sync_runs_v1.warnings_json` (TEXT).

## Wire format (backward compatible)

Two shapes are valid:

1. **Legacy:** JSON array of strings: `["warning a", "warning b"]`
2. **Extended:** JSON object:

```json
{
  "warnings": ["warning a", "warning b"],
  "audit": {
    "tabRows": { "items": 120, "modifiers": 40, "bundles": 12, "aliases": 200, "attributes": 55 },
    "itemsSkippedDuplicateRow": 3,
    "rowsFailedValidation": 2,
    "bundleUnknownSku": 0,
    "bundleUnknownModifier": 1,
    "blockingIssues": 0,
    "warningsEmitted": 8,
    "preflightDuplicatesResolved": 1,
    "syncCounts": {
      "itemsSynced": 117,
      "modifiersSynced": 40,
      "bundlesSynced": 12,
      "bundleItemsSynced": 34,
      "aliasesSynced": 198,
      "attributesSynced": 55
    }
  }
}
```

## Server parsing

- **`getCatalogSyncStatus()`** / **`listCatalogSyncRuns()`** in `src/server/repos/settingsRepo.ts` use `parseCatalogSyncWarningsPayload()` to return:
  - `warnings: string[]` — always an array for the UI
  - `syncAudit?: CatalogSyncRunAuditSummary` — present only for extended payloads

## TypeScript types

- **`src/shared/types/catalogSyncAudit.ts`** — `CatalogSyncRunAuditSummary`, `CatalogSyncCountsSnapshot`
- **`CatalogSyncStatusRecord`** — optional `syncAudit` (`src/shared/types/estimator.ts`)

## HTTP API

- **`POST /api/v1/settings/sync-catalog`** — response `data` includes optional `audit` (same shape as `syncAudit` in status).
- **`GET /api/v1/settings/catalog-sync-status`** — `warnings` + optional `syncAudit`.
- **`GET /api/v1/settings/catalog-sync-runs`** — each run includes `warnings` + optional `syncAudit`.

## UI consumption

- Continue rendering **`warnings`** as today (list of strings).
- Optionally display **`syncAudit`** on Settings / catalog admin: tab row counts, duplicate skips, validation row failures, and final `syncCounts` mirrors for operator confidence.

## When the payload stays legacy

- Failed runs that only store plain warning strings.
- Older runs inserted before this change.
- Code paths that call `buildCatalogSyncWarningsPayload(warnings)` without an audit object.
