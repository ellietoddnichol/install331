# Guarded sync plan (workbook-first, phased)

Principles: **validation reports first**, **no destructive SQL** (no `DELETE FROM catalog_items` / mass wipes), **preserve estimator behavior** (labor, modifiers, bundles, aliases), **TEXT ids** for `catalog_items`.

## Table / object classification

| Category | Objects | Notes |
| --- | --- | --- |
| **Published runtime** | `catalog_items` (physical); **`catalog_items_clean`** (PG view); `modifiers_v1`, `bundles_v1`, `bundle_items_v1`, `catalog_item_aliases`, `catalog_item_attributes` | Estimator reads today: items via **`getCatalogItemsTableName()`**; modifiers/bundles/attrs mostly **direct base tables**. |
| **Staging / audit** | `catalog_sheet_import_rows`, `catalog_sync_status_v1`, `catalog_sync_runs_v1` | Import trail + operator visibility. |
| **Legacy / parallel model** | `estimator_sku_aliases`, `estimator_catalog_item_attributes`, `estimator_norm_bundles_v1`, `estimator_norm_bundle_items_v1`, … | **Not** written by `googleSheetsCatalogSync`; see `docs/catalog-sync-architecture.md`. |
| **Deprecated / do-not-use for estimator sync** | Div10 Brain `catalog_items` (UUID) if present in same project — **do not mix** with TEXT-id estimator sync without design | See `published_schema_recommendation.md`. |

## Phase 0 — Baseline (current)

- Env points **`GOOGLE_SHEETS_TAB_ITEMS=CLEAN_ITEMS`** (default) + canonical tabs for modifiers/bundles/aliases/attributes.
- Sync writes **`catalog_items`** + related tables; reads use **`catalog_items_clean`** on Postgres when `CATALOG_ITEMS_TABLE` unset.

## Phase 1 — Validation reports only

1. Operator runs **`catalog:audit`** / **`catalog:audit:supabase-phase`** after a dry workbook change (or after sync to a **staging** database).
2. Resolve **duplicate SKUs**, **alias conflicts**, **missing required fields**, **suspicious labor** before calling prod sync “published.”

## Phase 2 — Bridge / adapters

1. Document **single BUNDLES tab** → `bundles_v1` + `bundle_items_v1` (already implemented).
2. Optional: introduce **views** `v_*_published` — must add to **`ALLOWED_TABLES`** (or equivalent) and mirror on SQLite in tests **before** flipping env.

## Phase 3 — Dry-run sync

1. Add a **dry-run** flag (future code): fetch tabs, run **`validateSheetRows`** + validators, emit report JSON under `reports/workbook-first-sync/runs/` — **no transaction commit**.
2. Compare row counts to Phase 1 DB audit.

## Phase 4 — Promote to published

1. Run **`syncCatalogFromGoogleSheets`** (or CI job) against prod credentials **only after** Phase 1–3 green.
2. **No** automatic deletion of stale catalog ids except existing **non-destructive** rules: deactivate **`sheet-item-*`** not in current sheet (merge mode); inactive alias/attribute rows skipped, not deleted.

## Code touchpoints (reads / writes)

| Concern | Write targets | Read surfaces |
| --- | --- | --- |
| Items | `googleSheetsCatalogSync.upsertItems` → **`catalog_items`** (`getCatalogItemsWriteTableName`) | **`catalogRepo`**, **`intake`**, settings health — `getCatalogItemsTableName()` / **`getCatalogItemsReadTableName()`** |
| Aliases / attributes | `upsertAliases`, `upsertAttributes` | `intakeMatcherService`, `catalogAliasesRepo`, `catalogAttributesRepo`, `takeoffRepo` |
| Modifiers / bundles | `upsertModifiers`, `upsertBundles` | `modifiersRepo`, `legacyRouter`, bundle flows |
| Staging | `catalog_sheet_import_rows` | Audits only |
| Config UX | `catalogSource.ts`, `settingsRoutes.ts` | `buildCatalogSourcePayload`, tab names for admin |

## Minimal implementation status

- **Items:** published read path **already** env-driven and view-backed on PG (`catalog_items_clean`).
- **Modifiers / bundles / aliases / attributes:** **follow-up PR** to swap queries to **`v_*_published`** views after migrations + SQLite test fixtures — **not** required to ship governance docs.

## Follow-up PR steps (explicit)

1. Add Supabase migration: `v_catalog_items_published` (stricter predicates) **only if** product wants narrower reads than full `catalog_items_clean`.
2. Extend `ALLOWED_TABLES` + `.env.example` for new view name; add SQLite `CREATE VIEW` in test setup mirroring PG.
3. Optionally add `getModifiersReadTableName()` pattern — same allowlist approach as catalog items.
4. Implement **`CATALOG_SYNC_DRY_RUN=1`** in `syncCatalogFromGoogleSheets` — log summary, skip `withCatalogSyncWriteTransaction` body.

---

*Companion: `workbook_to_supabase_mapping.md`, `sync_validation_rules.md`.*
