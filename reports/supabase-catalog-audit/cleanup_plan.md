# Staged cleanup plan (Phase 3)

## Principles

1. **Observe before mutate** — capture `pg_dump` / SQLite file copy + rerun audits (diff hashes).  
2. **Deactivate > delete.**  
3. **Never rotate `catalog_items.id` without surrogate mapping.**  
4. **Log transformations** (`estimator_catalog_validation_issues` plus optional `cleanup_run_id` CSV column appended manually).  

## Sequence

### Wave 0 — governance

1. Decide **single authoritative catalog lineage** (`TEXT` estimator vs Brain UUID — never merge without ETL bridge table).  
2. Publish **controlled vocabularies** (categories, labor families, UOM enums) — store as seeded reference tables (`CREATE TABLE estimator_catalog_vocab_*`) *when ready* — not mandatory day 1 if maintained in Sheets.

### Wave 1 — passive hygiene (no row merges)

1. Whitespace + obvious URL cleanup SQL (see `cleanup_sql_preview.sql`).  
2. Derived column backfills (`sku_normalized`, `manufacturer_normalized`) idempotent.  
3. Mark **non-blocking** validation issues for labor outliers.

### Wave 2 — alias integrity

1. Resolve `alias_conflicts.csv` — pick canonical item; remove or retarget duplicate alias rows.  
2. Audit `estimator_sku_aliases` vs `catalog_item_aliases` overlap — document decision tree in runbook.

### Wave 3 — duplicate clusters

1. Group by manufacturer+SKU key from `duplicate_candidates.csv`.  
2. Keep **one active canonical**; others `deprecated=1`, `active=0`, `duplicate_group_key` shared.  
3. If historical takeoff lines reference losers, **leave rows active but non-pickable** (`active=0`) only after verifying lines won’t require reselection — or keep `active=1` with **strong UI filter** (risky); prefer **alias pointer** from loser → winner if UI allows remapping.

### Wave 4 — modifier / bundle alignment

1. Reconcile `modifiers_v1` vs `estimator_parametric_modifiers` keys per category.  
2. Fix dangling `bundle_items_v1` references.

### Wave 5 — enrichment (see `enrichment_plan_div10.md`)

Add **targeted** rows + aliases; avoid mass seed import without labor review.

## Reversibility

Each wave should commit as **separate migration file** or **dated SQL script** checked into `supabase/migrations/` with descriptive names; include **down migration** where feasible (UPDATE reversions for flags).

## Logging standard

For each batch:

- `issue_type='CLEANUP_BATCH'`, `detail_json` includes `{ batch, operator, sql_file, row_count }`.
