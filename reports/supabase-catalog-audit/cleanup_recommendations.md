# Cleanup recommendations (non-destructive bias)

Grouped by readiness. Coordinate with **`cleanup_plan.md`** and **`cleanup_sql_preview.sql`**.

## Safe automated fixes (high confidence after dry-run CSV review)

1. Normalize whitespace-only strings → NULL where policy allows (`NULLIF(trim(x),'')`).
2. Uppercase **`uom`** when value maps 1:1 to approved enumerator.
3. Backfill **`category_main`** from controlled map when Sheets category strings drift (“Washroom Accessories” ↔ “Toilet Accessories”).
4. Populate **`canonical_sku`** when null from `sku` (already migrated once — re-run guarded for new imports).
5. Repair obvious **`image_url`** formatting (trim, fix `https:///`, reject non-http schemes into validation issues).

## Automated with guardrails

1. **`deprecated=1`** on duplicate losers when `duplicate_group_key` populated by deterministic rule (same SKU, same manufacturer_normalized, chooses lowest `catalog_source_row` or manual winner column).
2. **`active=0`** for sheet-deactivated imports without deleting row (preserve provenance).
3. **`estimator_catalog_validation_issues` bulk insert** from audit deltas with `severity=watch` vs `blocking`.

## Human review mandatory

1. Labor minute reconciliation between duplicates.
2. Cross-brand SKU aliases impacting bid strategy.
3. Bundle conversion from single SKU row.
4. Partition “EA vs COMPARTMENT” UOM swaps affecting historical projects (project-level snapshots may still retain old totals).

## Do not automate without reversible migration artifacts

1. Physical merge/deletion of **`catalog_items`** rows referenced by `takeoff_lines_v1.catalog_item_id`.  
   Prefer **`alias_of`** + **`deprecated`** + **`active`** flags preserving **immutable `id`**.  
2. Rewriting **`id`** (`sheet-item-*` keys tied to ingest — changing breaks provenance linkage without mapping table (`catalog_id_rewrites_v1` pattern if ever introduced)).

## Separation labels

| Class | Meaning |
|-------|---------|
| Confirmed risk | Duplicate alias targets; dangling bundle refs |
| Likely gap | Thin categories from `category_coverage_summary.csv` |
| Inferred improvement | Unified modifier view |
