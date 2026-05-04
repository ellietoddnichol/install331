# Catalog sync architecture (Sheets → Postgres → estimator reads)

This document is the **single coordination point** for catalog source-of-truth, aligned with `docs/SCHEMA.md` for schema-change order.

## TL;DR roles

| Layer | Responsibility |
| --- | --- |
| **Google Sheets** (`CLEAN_ITEMS`, `MODIFIERS`, `BUNDLES`, optional `ALIASES`, `ATTRIBUTES`) | Human-editable **staging / authoring** feed. Operators edit here first. |
| **Supabase / Postgres** (`DB_DRIVER=pg`) | **Production shared catalog**: relational rows the deployed app reads in PG mode. |
| **`catalog_sheet_import_rows`** | **Raw audit trail** per sync batch (tab, row number, JSON snapshot). Not used for runtime reads. |
| **`catalog_items` (base table)** | **Physical storage** for estimator-usable catalog rows. Sheet sync **writes** here only (never into a view). |
| **`catalog_items_clean` (view)** | **Optional read alias** in Postgres: `SELECT * FROM catalog_items`. Lets operators talk about “clean catalog” without duplicating data. |
| **SQLite** (`DB_DRIVER=sqlite`) | **Local / offline / tests** only. Never competes with Postgres in production. |

## Answers (audit checklist)

### SQLite mode — what does the app read?

- **Default:** physical table `catalog_items` (unless `CATALOG_ITEMS_TABLE` overrides — see below).
- **Seeding:** `ensureTakeoffCatalogSeeded()` inserts shorthand rows into **`catalog_items`** when **not** using the clean read alias (`isUsingCleanCatalogSource()` is false).

### Postgres mode — what does the app read?

- **Configured read relation:** `getCatalogItemsTableName()` → `catalog_items` or **`catalog_items_clean`** (view over `catalog_items`).
- **Production default:** when `DB_DRIVER=pg` and `CATALOG_ITEMS_TABLE` is unset, **`catalog_items_clean`** is assumed so production aligns with the CLEAN_ITEMS mental model (still one physical table underneath).

### Where does Google Sheet data enter the database?

- **`syncCatalogFromGoogleSheets()`** in `src/server/services/googleSheetsCatalogSync.ts`.
- Tabs from env: `GOOGLE_SHEETS_TAB_ITEMS` (default `CLEAN_ITEMS`), `GOOGLE_SHEETS_TAB_MODIFIERS`, `GOOGLE_SHEETS_TAB_BUNDLES`, optional aliases/attributes tabs.
- Writes land on **`getCatalogItemsWriteTableName()`** → always **`catalog_items`** (never the clean view).

### Reads vs writes — `catalog_items` vs `catalog_items_clean`

- **`catalog_items_clean`** in Supabase is a **VIEW** (`20260430130000_catalog_items_clean_view.sql`). It is **read-only**.
- All **INSERT/UPDATE** paths must target **`catalog_items`** (via `getCatalogItemsWriteTableName()`).

### Aliases and attributes — authoritative Sheet sync targets

Sheet import (`upsertAliases` / `upsertAttributes` in `googleSheetsCatalogSync.ts`) reads optional **ALIASES** and **ATTRIBUTES** tabs and writes **only** these tables:

| Table | Columns (write path) | `ON CONFLICT` target |
| --- | --- | --- |
| **`catalog_item_aliases`** | `id`, `catalog_item_id`, `alias_type`, `alias_value`, `created_at`, `updated_at` | `(catalog_item_id, alias_type, alias_value)` |
| **`catalog_item_attributes`** | `id`, `catalog_item_id`, `attribute_type`, `attribute_value`, `material_delta_type`, `material_delta_value`, `labor_delta_type`, `labor_delta_value`, `active`, `sort_order`, `created_at`, `updated_at` | `(catalog_item_id, attribute_type, attribute_value)` |

**Postgres:** `catalog_item_aliases` / `catalog_item_attributes` plus unique indexes **`uq_catalog_item_aliases_unique`** and **`uq_catalog_item_attributes_unique`** are created by migration **`20260504180000_catalog_item_aliases_attributes_sheet_sync.sql`** (after `catalog_items` exists — `0001_v1_baseline.sql`). FK: `catalog_item_id` → `catalog_items(id)` **ON DELETE CASCADE**.

**SQLite:** same DDL and unique indexes live in **`src/server/db/schema.ts`**.

### Parallel normalization tables (legacy / not used by Sheet sync UPSERT today)

**`0003_estimator_catalog_normalization_v1.sql`** defines **`estimator_sku_aliases`**, **`estimator_catalog_item_attributes`**, defs, norm bundles — a separate model (attribute defs FK, global alias uniqueness on `lower(alias_text)`). **Sheet sync does not write those tables.** No views bridge them; apps that need both models should query each explicitly.

### Runtime paths that assumed SQLite only (historical)

- Direct `getEstimatorDb()` in catalog routes/repos/sync **was SQLite-only** and threw under `DB_DRIVER=pg`. Catalog sync and repos now use **`DbExec`** / `dbAll` so Postgres transactions apply.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DB_DRIVER` | `sqlite` (default dev/tests) or **`pg`** (Supabase/production). |
| `DATABASE_URL` | Required when `DB_DRIVER=pg`. |
| `CATALOG_ITEMS_TABLE` | **Read** surface: `catalog_items` or `catalog_items_clean`. |
| `CATALOG_SOURCE` | **`supabase`** \| **`sqlite`** \| **`sheet_staging`** — intent flag for ops/docs (`sheet_staging` = Sheets are authoritative until synced). |
| `CATALOG_SYNC_REPLACE_MODE` | `1` = legacy full-table deactivate behavior; default **merge/upsert**. |

**Expected combinations**

- **Production:** `DB_DRIVER=pg`, `CATALOG_SOURCE=supabase`, `CATALOG_ITEMS_TABLE` unset or `catalog_items_clean`.
- **Local SQLite:** `DB_DRIVER=sqlite`, `CATALOG_SOURCE=sqlite`, optional sheet staging when testing sync.

## Sync pipeline (high level)

1. Fetch tabs from Google Sheets API.
2. **Optional:** append raw rows to `catalog_sheet_import_rows` with `sync_batch_id`, `source_tab`, `sheet_row_number`, `raw_cells_json`.
3. Normalize row fields (SKU, manufacturer, category buckets, units) via `src/server/services/catalog/catalogNormalization.ts`.
4. **Upsert** into **`catalog_items`** (merge mode by default); deactivate prior `sheet-item-*` ids only when safe (see `CATALOG_SYNC_REPLACE_MODE` and code comments).
5. Upsert **modifiers**, **bundles**, optional **aliases** / **attributes**.
6. Record counts + warnings in `catalog_sync_status_v1` / `catalog_sync_runs_v1`.

## Normalization rules (reference)

Implemented in `catalogNormalization.ts`: manufacturer/SKU/category/unit helpers and `buildCatalogCanonicalKey`. Raw sheet strings remain in descriptive columns where applicable; normalized keys support duplicate detection and intake matching without destroying display text.

## Verification

- `npm run lint`
- `npm test` (includes catalog / sync / repo tests — e.g. `googleSheetsCatalogSync.integration.test.ts` for transactional sheet upserts on SQLite without Google APIs)
- `npm run catalog:audit` — CSV reports under `reports/catalog-audit/`
- `npm run catalog:audit:supabase` — thin wrapper with explicit PG catalog audit naming (`DATABASE_URL` + `DB_DRIVER=pg`)

### Postgres (Supabase) sync verification after migration

1. Apply migrations (`supabase db push` / your CI pipeline — order is chronological under `supabase/migrations/`; alias/attributes migration **`20260504180000_*`** follows staging/provenance **`20260504140000_*`** and baseline **`catalog_items`**).
2. Confirm objects: tables **`catalog_item_aliases`**, **`catalog_item_attributes`**; unique indexes **`uq_catalog_item_aliases_unique`**, **`uq_catalog_item_attributes_unique`** (`\d`/Supabase Studio).
3. Run a **`syncCatalogFromGoogleSheets`** (or staged write test) once with a sheet that includes ALIASES/ATTRIBUTES rows; **`ON CONFLICT`** must succeed (no “no unique constraint” errors).
4. Optional: **`npm run catalog:audit:supabase`** with `DATABASE_URL` set to audit row counts/consistency.

## Manual follow-up

- Review CSV outputs after first production sync; resolve duplicate canonical keys before enabling aggressive replace modes.
- If you rely on **`estimator_sku_aliases`** / **`estimator_catalog_item_attributes`**, plan data movement separately — Sheet sync does not populate those tables automatically.
