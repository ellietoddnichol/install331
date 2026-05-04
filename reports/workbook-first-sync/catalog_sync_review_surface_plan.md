# Catalog sync review surface — plan & delivery notes

## Goals

- Surface **workbook-first** catalog sync outcomes for human review without new database tables.
- Keep **backward compatibility**: `warnings` remains a `string[]` on all sync responses; extended payloads stay in JSON (`warnings_json` + optional `syncAudit`).

## UX (implemented)

Single **expandable panel** (“Sync publish review”) under **Catalog → Module 01 / Sync Status**:

- Shows **spreadsheet ID** (when configured) and **resolved tab names** (`itemsConfigured` vs `itemsFetch` when they differ).
- **`lastAttemptSummary`** chips when present (skipped duplicate item rows, failed cell validation counts, bundle preflight refs, last persisted sync counts).
- **Blocking failure** uses existing `CatalogSyncStatusRecord.message` (preflight or runtime failure).
- **Sub-tabs**: Duplicate SKU hints, Alias conflicts, Labor outliers, Orphan bundles, Orphan attrs/aliases, **Raw audit** (full `syncAudit` JSON).
- Sections prefer **`syncAudit.catalogReview`** (truncated counts + samples, max 40 per category server-side via `CATALOG_SYNC_REVIEW_MAX_SAMPLES`). When audit sections are sparse, matching **warning lines** are used as fallback.
- Empty hint points operators at **`npm run catalog:publish:blockers`** for a fuller offline CSV workflow (no new GET endpoint).

## API shape

### `GET /v1/settings/catalog-sync-status`

`CatalogSyncStatusRecord` gains:

| Field | Description |
|--------|-------------|
| `warnings` | Unchanged — string array |
| `syncAudit` | Full structured audit when stored in `warnings_json` |
| `workbook` | **Deployment snapshot**: `spreadsheetId`, `spreadsheetIdConfigured`, `tabs.{itemsConfigured,itemsFetch,modifiers,bundles,aliases,attributes}` |
| `lastAttemptSummary` | Ergonomic copy of counters from `syncAudit` (`buildCatalogSyncLastAttemptSummary`) |

**Note:** `workbook` reflects **current server env**, not historical per-run values (consistent with workbook-first ops model).

### `GET /v1/settings/catalog-sync-runs?limit=`

`CatalogSyncRunHistoryRecord`: same enrichment as status per row (`workbook`, `lastAttemptSummary`, `syncAudit`, `warnings`). Newest row is index `0`.

### `POST /v1/settings/sync-catalog`

`CatalogSyncResult.tabs` extended with **`aliases`** and **`attributes`** (plus existing `items`, `modifiers`, `bundles`).

### Failed / preflight-blocked runs

- **Preflight blocking** now **persists** `warnings_json` with `{ warnings, audit }` (including `catalogReview`) before throwing, and records a **failed** row in `catalog_sync_runs_v1` without double-inserting in the catch path.
- Other failures after a successful preflight attach **`lastPassedPreflightAudit`** to the failed status/run when recording.

## Audit extensions (`warnings_json.audit`)

- **`catalogReview`**: counts + capped sample lists for duplicate SKU collisions, alias multi-target collisions, labor outliers (from workbook labor heuristics), orphan bundle SKU/modifier references, orphan attribute/alias canonical SKUs relative to ITEMS ∪ DB snapshot used in preflight.

## Limits

- Review samples capped at **`CATALOG_SYNC_REVIEW_MAX_SAMPLES` (40)** per list server-side; UI caps display at 50 lines per subsection.
- **`blocking` preflight reasons** remain capped at **`MAX_BLOCKING` (24)** in validation — full SKU-level issues may exceed what is enumerated in text; rerun after fixes or use `catalog:publish:blockers`.
- **Insert vs update** per spreadsheet row is not tracked; “persisted counts” mirror post-transaction **`syncCounts`**, not deltas.

## Follow-ups (not done)

- Optional **historical workbook snapshot per run** (would require storing spreadsheet id/tabs at attempt time — small additive columns or JSON blob; deferred).
- **GET `/catalog/publish-review`** aggregate from DB was explicitly avoided unless `syncAudit` proves insufficient.

## Verification

- `npm run lint` (tsc --noEmit).
