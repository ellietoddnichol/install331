# Estimator catalog normalization (Phase 2) — v1

Add-only SQL + seed data. **Does not** replace or migrate the live `catalog_items` / `modifiers_v1` / `bundles_v1` tables; the app and Google Sheet sync keep using them unchanged.

## Tables (public / SQLite)

| Table | Role |
|-------|------|
| `estimator_catalog_attribute_defs` | Reusable attribute keys (material, mounting, partition material, …). |
| `estimator_catalog_item_attributes` | (catalog item × attribute) values. |
| `estimator_parametric_modifiers` | Modifiers with flat/percent + optional `labor_cost_multiplier` (separate from `modifiers_v1` for future engine use). |
| `estimator_sku_aliases` | Legacy / vendor / parser / generic text → `catalog_items.id` (e.g. `BRADLEY-812` → `c1`). Unique on `lower(alias_text)`. |
| `estimator_norm_bundles_v1` + `estimator_norm_bundle_items_v1` | Relational bundle model for migration/planning; may reference `legacy_bundle_id` to `bundles_v1.id`. |
| `estimator_catalog_validation_issues` | Staging for `catalog:audit` / import validation (not wired everywhere yet). |

Migrations: `supabase/migrations/0003_estimator_catalog_normalization_v1.sql`.  
SQLite: same DDL + seeds in `src/server/db/schema.ts` (`seedEstimatorNormLayerExamples`).

## TypeScript

- `src/shared/types/estimatorCatalogNorm.ts` — DTOs.
- `src/server/repos/estimatorNormCatalogRepo.ts` — list/resolve queries.
- `src/server/services/catalog/resolveCatalogAlias.ts` — `resolveTargetCatalogItemIdBySkuOrAlias` (SKU or alias first hit).

## Seeds

- Bobrick **B-6806** line as canonical `c1` / `GA-36`; **BRADLEY-812** as vendor alias.  
- Partition `c3`: `HDPE` attribute.  
- Parametric: surface, recessed (with labor multiplier 1.08), stainless uplift, ADA bump.  
- Norm bundle: `norm-bundle-ada-restroom` → `c1` / `c5` / `c6` with `legacy_bundle_id` = `bundle-ada-single-stall` where that bundle exists.

**Div 10 Brain** uses different `public.catalog_items` (uuid) in a separate feature — estimator tables are prefixed with `estimator_` to avoid clashing with it.

## Next (Phase 3+)

- Transform proposals, bulk backfill, and **optional** read paths that join attributes/aliases; keep v1 takeoff and pricing on `catalog_items` until explicitly switched.
