# Implementation delta — workbook-first published surface

## Files changed

### SQL

- `supabase/migrations/20260504210000_supporting_catalog_clean_views.sql` — `CREATE VIEW … AS SELECT * FROM <base>` for eight supporting relations (`*_clean`).

### Server

- `src/server/db/catalogTable.ts` — read helpers + env whitelist resolution for supporting tables.
- `src/server/repos/catalogRepo.ts` — published reads for alias join + attribute aggregate.
- `src/server/repos/bundlesRepo.ts` — bundle / bundle_items reads.
- `src/server/repos/modifiersRepo.ts` — modifier catalog reads.
- `src/server/repos/catalogAliasesRepo.ts` / `catalogAttributesRepo.ts` — list SELECTs.
- `src/server/repos/estimatorNormCatalogRepo.ts` — estimator normalization reads.
- `src/server/repos/takeoffRepo.ts` — catalog attribute delta reads.
- `src/server/services/intakeMatcherService.ts` — alias / attribute reads.
- `src/server/routes/legacyRouter.ts` — modifier/bundle GET + read-before-write SELECTs.
- `src/server/services/googleSheetsCatalogSync.ts` — modifier-key read inside bundle upsert; warning when items tab is literally `ITEMS`.

### Tooling / config / docs

- `scripts/publish-blockers-report.ts` — consolidated blocker CSV.
- `package.json` — `catalog:publish:blockers` script.
- `.env.example` — comments for new read overrides + publish blocker allow-list.
- `reports/workbook-first-sync/published_supporting_tables_plan.md`
- `reports/workbook-first-sync/sync_precedence_rules.md`
- `reports/workbook-first-sync/publish_blockers_checklist.md`
- `reports/workbook-first-sync/IMPLEMENTATION_DELTA.md` (this file)

## Helpers / views summary

- Views: `modifiers_v1_clean`, `bundles_v1_clean`, `bundle_items_v1_clean`, `catalog_item_aliases_clean`, `catalog_item_attributes_clean`, `estimator_parametric_modifiers_clean`, `estimator_sku_aliases_clean`, `estimator_catalog_item_attributes_clean`.
- TS API: `getCatalogModifiersReadTableName()`, `getBundlesReadTableNames()`, `getCatalogItemAliasesReadTableName()`, `getCatalogItemAttributesReadTableName()`, `getEstimatorParametricModifiersReadTableName()`, `getEstimatorSkuAliasesReadTableName()`, `getEstimatorCatalogItemAttributesReadTableName()`.

## Remaining manual review

1. **Dual-tab ITEMS + CLEAN_ITEMS:** No automated dual-ingest; operators choose one tab via `GOOGLE_SHEETS_TAB_ITEMS`. Future optional flag could validate tab naming or fetch both — needs product spec.
2. **Category allow-list:** Publish blocker category gate is **opt-in** via `PUBLISH_BLOCKERS_ALLOWED_CATEGORIES`; consider exporting a canonical category list from Div10 / estimator config when available.
3. **`estimator_norm_*` bundles:** Not wired to published views — add views + helpers when a runtime read path appears.
4. **Deploy:** Apply new migration on Postgres before relying on default `*_clean` read names.

---

## Wave: workbook-first guardrails + sync audit (2026-05)

### Server / shared

- `src/server/services/googleSheetsCatalogSync.ts` — item tab resolution (`GOOGLE_SHEETS_TAB_CLEAN_ITEMS` + `CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB`), staging tab guards, staging skip logs, preflight gate, `warnings_json` payload with optional `audit`.
- `src/server/services/catalogSyncWorkbookValidation.ts` — pre-transaction validation (blocking vs warnings), `buildCatalogSyncWarningsPayload` / `parseCatalogSyncWarningsPayload`.
- `src/shared/catalogValidationConstants.ts` — shared `CATALOG_ALLOWED_UOM`.
- `src/shared/types/catalogSyncAudit.ts` — `CatalogSyncRunAuditSummary` / counts snapshot types.
- `src/server/repos/settingsRepo.ts` — parse legacy vs extended `warnings_json`.
- `src/server/services/catalogSource.ts` — notes when configured items tab differs from fetch tab.
- `src/shared/types/estimator.ts` — optional `syncAudit` on catalog sync status.
- `src/services/api.ts` — types for `audit` / `syncAudit` on sync endpoints.

### Scripts

- `scripts/catalog-audit.ts`, `scripts/publish-blockers-report.ts` — import `CATALOG_ALLOWED_UOM` from shared constants.

### Docs (this folder)

- `sync_precedence_rules.md` — expanded enforced behavior + env flags.
- `publish_blockers_checklist.md` — preflight vs report alignment.
- `sync_run_report_design.md` — `warnings_json` shape + API/UI notes.
- `.env.example` — workbook-first env comments.

### Tests / verification

- `npm run lint` (tsc --noEmit)
- `node --import tsx --test src/server/services/googleSheetsCatalogSync.integration.test.ts`

### Manual review leftover

1. **Dual-tab merge** of ITEMS + CLEAN in one run is still out of scope; normalize in the workbook or pick a single tab policy.
2. **`PUBLISH_BLOCKERS_ALLOWED_CATEGORIES` during sync** is strict when set — omit in env or list every allowed category.
3. **Oversized `warnings_json`** — extended payloads add audit JSON; monitor if operators accumulate huge warning lists.

---

## Wave: catalog sync review API + Catalog UI (2026-05)

### Server / shared

- `src/shared/types/catalogSyncAudit.ts` — `CatalogSyncWorkbookSnapshot`, `CatalogSyncReviewSummary`, `CatalogSyncLastAttemptSummary`, `buildCatalogSyncLastAttemptSummary`, `catalogReview` on audit, `CATALOG_SYNC_REVIEW_MAX_SAMPLES`.
- `src/server/services/catalogSyncWorkbookValidation.ts` — populate `audit.catalogReview` (counts + capped samples) during preflight.
- `src/server/services/catalogSource.ts` — `buildCatalogSyncWorkbookSnapshot()`.
- `src/server/services/googleSheetsCatalogSync.ts` — `CatalogSyncResult.tabs` includes aliases/attributes; preflight failure persists audit + run without double-recording; generic catch persists `lastPassedPreflightAudit` when recording failure.
- `src/server/repos/settingsRepo.ts` — attach `workbook`, `lastAttemptSummary` to sync status and each history row; `listCatalogSyncRuns` → `CatalogSyncRunHistoryRecord`.
- `src/shared/types/estimator.ts` — `CatalogSyncStatusRecord` workbook/summary fields; `CatalogSyncRunHistoryRecord`.

### Client

- `src/services/api.ts` — `getCatalogSyncRuns` / `syncV1Catalog` typings aligned with server.
- `src/pages/Catalog.tsx` — expandable “Sync publish review” panel + resolved tab summary tile.
- `src/pages/Settings.tsx` — `syncRuns` typed as `CatalogSyncRunHistoryRecord[]`.

### Docs

- `reports/workbook-first-sync/catalog_sync_review_surface_plan.md`
- `reports/workbook-first-sync/IMPLEMENTATION_DELTA.md` (this append)

### Verify

- `npm run lint`
- `node --import tsx --test src/server/services/googleSheetsCatalogSync.integration.test.ts`

---

## Wave: historically self-describing sync runs (2026-05)

### DB

- `supabase/migrations/20260504221500_catalog_sync_run_context.sql` — `ALTER TABLE catalog_sync_runs_v1 ADD COLUMN IF NOT EXISTS run_context_json TEXT`.
- `src/server/db/schema.ts` — SQLite `CREATE` + `ALTER` parity for `run_context_json`.

### Shared / server

- `src/shared/types/catalogSyncAudit.ts` — `CatalogSyncRunContext`, `CatalogSyncServerConfigNow`, importer + validation snapshots, `parseCatalogSyncRunContextJson`, `sliceCatalogSyncRunContextBody`, `cleanItemsTabEnv` on `CatalogSyncWorkbookSnapshot` tabs type.
- `src/server/services/googleSheetsCatalogSync.ts` — `buildCatalogSyncRunContextRecord()`, `peekCatalogSyncSpreadsheetEnvForRunContext()`; all `insertSyncRun` paths pass serialized `runContext`.
- `src/server/services/catalogSource.ts` — `buildCatalogSyncServerConfigNow()`; `buildCatalogSyncWorkbookSnapshot()` uses shared resolver.
- `src/server/repos/settingsRepo.ts` — `serverConfigNow`, `historicalSyncRunContext`; `workbook` from historical parsed JSON when present else live env (latest-run JSON for sync status snapshot).
- `src/server/services/catalogSyncWorkbookValidation.ts` — `CATALOG_SYNC_PREFLIGHT_MAX_BLOCKING` export.

### Types / UI

- `src/shared/types/estimator.ts` — extend `CatalogSyncStatusRecord`, `CatalogSyncRunHistoryRecord` with fields above.
- `src/pages/Catalog.tsx` — historical vs current workbook chip; collapsible review sections with counts + samples; fold-out live server summary.
- `src/pages/Settings.tsx` — **Context** column on sync run rows.

### Docs (this folder)

- `reports/workbook-first-sync/sync_run_historical_context_plan.md`
- `reports/workbook-first-sync/manual_review_queue_plan.md`

---

## Wave: actionable manual-review workflows (CSV + Catalog tables) (2026-05)

### Server / shared

- `src/shared/catalogReviewQueues.ts` — queue enum (`CATALOG_REVIEW_QUEUE_KEYS`), line classifier, merged warning/message sources, export line resolver (+ audit-sample fallback), SKU/token guess + `/catalog?q=` path helper.
- `src/server/services/catalogSyncReviewCsv.ts` — builds CSV rows from `warnings_json`, run `message`, and `run_context_json`.
- `src/server/repos/settingsRepo.ts` — `latestCatalogSyncRunId` on `getCatalogSyncStatus()` (newest `catalog_sync_runs_v1.id`); `getCatalogSyncRunRowForCsv(runId?)`.
- `src/server/routes/v1/settingsRoutes.ts` — **GET** `/catalog-sync-review-csv?queue=…&runId=optional` → `text/csv` (400 JSON on bad queue; 404 plain text when empty).

### Types / client

- `src/shared/types/estimator.ts` — optional `latestCatalogSyncRunId` on `CatalogSyncStatusRecord`.
- `src/services/api.ts` — `downloadCatalogSyncReviewCsv(queue, runId?)`.
- `src/pages/Catalog.tsx` — Manual review subsection (preview tables + CSV buttons); **`?q=`** initializes search once.

### Docs (this folder)

- `reports/workbook-first-sync/catalog_manual_review_workflow.md`
- `reports/workbook-first-sync/review_queue_data_model_recommendation.md`

### CSV columns

`run_id`, `attempted_at`, `spreadsheet_id`, `items_fetch_tab`, `queue`, `detail`, `primary_search_token`, `catalog_search_path`

### Verify

- `npm run lint`

---

## Wave: sync status merges audit from latest run row (2026-05)

**Issue:** Catalog “Sync publish review” read `syncAudit` only from `catalog_sync_status_v1.warnings_json`. Structured `catalogReview` often lives on the newest `catalog_sync_runs_v1.warnings_json` only, so the UI showed empty queues despite a populated run history.

**Change:** `getCatalogSyncStatus()` loads `warnings_json` from the latest run (same query as historical context) and **merges** with the status-row payload: audit = status audit ?? latest-run audit; warnings = deduped concatenation.

**Files:** `src/server/repos/settingsRepo.ts`

### Verify

- `npm run lint`

---

## Wave: queue-driven workbook cleanup operator guides (docs + CSV only) (2026-05)

- `reports/workbook-first-sync/queue_cleanup_batch_plan.md` — phased structural cleanup batches (duplicate SKU → aliases → bundles/modifiers → attributes/aliases orphans → labor).
- `reports/workbook-first-sync/workbook_edit_targets_by_queue.md` — governed-tab targets + remediation skew per sync review queue.
- `reports/workbook-first-sync/top_issues_to_fix_first.csv` — ranked topical issues keyed to **`queue`** CSV exports (`duplicate_sku_groups`, `alias_collisions`, …).
- **No new schema / app code.**

---

## Wave: catalog_items.id collision analysis + SKU stable-key normalization (2026-05)

- `reports/workbook-first-sync/id_collision_root_cause.md` — `id` derivation, `ON CONFLICT(id)`, batch/history risks, workbook-first id strategy.
- `reports/workbook-first-sync/id_collision_candidates.sql` — duplicate `lower(sku)` diagnostics.
- `reports/workbook-first-sync/top_duplicate_sku_candidates_header.csv` — paste CSV header.
- `src/server/services/googleSheetsCatalogSync.ts` — **`workbookCatalogStableSegment()`**; SKU/Item Key limbs use **lowercase** `stableKey` for `sheet-item-${stableKey}`.
- `src/server/services/googleSheetsCatalogSync.integration.test.ts` — aligned seed **`sheet-item-`** id casing.

### Verify

- `npm run lint`
- `npx tsx --test src/server/services/googleSheetsCatalogSync.integration.test.ts`

---

## Wave: workbook-first catalog id strategy governance docs (docs only) (2026-05)

- `reports/workbook-first-sync/catalog_id_strategy_review.md` — identity-risk patterns vs current `stableKey`/lookup behavior; Phase A posture (no DDL).
- `reports/workbook-first-sync/recommended_long_term_id_strategy.md` — precedence table (explicit id → composite mfr+SKU → SKU → Item Key → hash); optional additive `workbook_catalog_item_uid` rollout sketch.
- `reports/workbook-first-sync/identity_risk_candidates.csv` — heuristic rows for QA / paste-append with SQL export results (**no codegen**).

### Identity audit script (manufacturer + SKU)

- `scripts/identity-risk-mfr-sku-audit.ts` — read-only DB scan; writes `identity_risk_remediation_queue.csv`, `manufacturer_sku_collision_summary.md`, and `recommended_preflight_hardening_next.md` under `reports/workbook-first-sync/` (queue sorted: CLEAN_ITEMS rows first, then tier, SKU, id).
- **Run:** `npm run catalog:audit:identity-mfr-sku` (optional `DB_DRIVER=pg` + `DATABASE_URL` for Postgres).


