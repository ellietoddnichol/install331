# Published schema recommendation (curated tabs only)

Goals: **TEXT ids** on **`catalog_items`** (SQLite parity), **no destructive deletes** of historical catalog rows, clear separation between **staging** ingest and **published** runtime surfaces.

## Current state (already close for items)

- **Physical storage:** `catalog_items` (TEXT `id`).
- **Published read alias (Postgres):** `catalog_items_clean` **VIEW** — `SELECT * FROM catalog_items` (`supabase/migrations/20260430130000_catalog_items_clean_view.sql`).
- **App reads:** `getCatalogItemsTableName()` / `getCatalogItemsReadTableName()` default to `catalog_items_clean` on PG, `catalog_items` on SQLite (`src/server/db/catalogTable.ts`).
- **App writes (sync):** always `getCatalogItemsWriteTableName()` → `catalog_items`.

This already matches the **“optional `catalog_items_published` / view pattern”** for the item grid, under the name **`catalog_items_clean`**.

## Recommended evolution

### 1. Items — optional stricter published view

If governance needs **forward-facing-only** rows without changing physical storage:

- Add **`v_catalog_items_published`** (or rename conceptually) as a view over `catalog_items` with predicates such as:
  - `active = 1`
  - `COALESCE(deprecated, 0) = 0`
  - `is_canonical = 1`
  - (optional) `catalog_source_tab = 'CLEAN_ITEMS'` or batch id filters once promote workflow exists  

**Compatibility:** extend **`CATALOG_ITEMS_TABLE` allowlist** in `catalogTable.ts` only after the view exists on Postgres **and** SQLite tests define the same view for local parity (tests already create `catalog_items_clean` as `SELECT * FROM catalog_items`).

**Preserve TEXT ids:** all views must **reference** `catalog_items.id`, never UUID substitution.

### 2. Aliases & attributes

- **Physical:** `catalog_item_aliases`, `catalog_item_attributes` (already FK to `catalog_items`).
- **Published:** optional views **`v_catalog_item_aliases_published`**, **`v_catalog_item_attributes_published`** filtering `active` and joining only **published** catalog items if a stricter item view is adopted.

**Code touchpoints:** **`intakeMatcherService.ts`**, **`catalogAliasesRepo.ts`**, **`catalogAttributesRepo.ts`**, **`takeoffRepo.ts`** (attribute snapshots) — today query base tables directly.

### 3. Modifiers & bundles

- **Physical:** `modifiers_v1`, `bundles_v1`, `bundle_items_v1`.
- **Published:** optional **`v_modifiers_v1_published`** (`active = 1`), **`v_bundles_v1_published`**, **`v_bundle_items_v1_published`** (join bundle items to published catalog rows only if item view is strict).

**Code touchpoints:** **`modifiersRepo.ts`**, **`legacyRouter.ts`** (bundles/modifiers CRUD), **`googleSheetsCatalogSync.ts`** (write targets stay **tables**).

### 4. Staging (unchanged + future)

| Artifact | Role |
| --- | --- |
| **`catalog_sheet_import_rows`** | Raw row JSON + batch id + tab + sheet row# — audit / replay. |
| **Future `catalog_sync_promotions_v1`** (optional) | Metadata for “promote batch X to published” without deleting history. |

### 5. Bridge strategy (no destructive deletes)

1. **Sync continues to upsert** into physical **`catalog_items`** / related tables (or into **`catalog_items_staging`** in a later phase — not required if validation gates promotion in place).
2. **Published layer** is **views** (or read replicas) over the same rows; “deprecate” uses **`deprecated` / `active`** flags, not `DELETE FROM catalog_items`.
3. **bundle_items_v1** repopulation per bundle is **scoped** and acceptable for line-item explosion; avoid global `TRUNCATE`.

### 6. Supabase vs Div10 Brain naming

Migration **`20260414120000_div10_brain_init.sql`** introduces a **separate** `public.catalog_items` concept (UUID-oriented) for Div10 Brain. Estimator workbook sync targets the **TEXT-id** lineage from **`0001_v1_baseline.sql`** / **`20260430131500_estimator_catalog_columns.sql`**. Operate estimator catalog sync only against the **estimator** table set; do not conflate the two products without an explicit integration design.

---

*See `guarded_sync_plan.md` for phased rollout and code touchpoints.*
