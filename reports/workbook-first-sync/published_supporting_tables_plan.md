# Published supporting tables — design and implementation

## Goal

Mirror the **`catalog_items` / `catalog_items_clean`** pattern for dependent workbook surfaces: aliases, attributes, modifiers, bundles (and estimator normalization reads), so Postgres deployments can standardize on **`SELECT *`-compatible views** (`*_clean`) without duplicating rows. SQLite continues to read **physical tables** by default.

## Naming

Aligned with `catalog_items_clean`: each view is `{base_table}_clean`.

| Physical table | Published view (Postgres) |
|----------------|---------------------------|
| `modifiers_v1` | `modifiers_v1_clean` |
| `bundles_v1` | `bundles_v1_clean` |
| `bundle_items_v1` | `bundle_items_v1_clean` |
| `catalog_item_aliases` | `catalog_item_aliases_clean` |
| `catalog_item_attributes` | `catalog_item_attributes_clean` |
| `estimator_parametric_modifiers` | `estimator_parametric_modifiers_clean` |
| `estimator_sku_aliases` | `estimator_sku_aliases_clean` |
| `estimator_catalog_item_attributes` | `estimator_catalog_item_attributes_clean` |

`estimator_norm_bundles_v1` / `estimator_norm_bundle_items_v1` are **not** used by current server read paths; no views added until there is a runtime consumer.

## Migration

`supabase/migrations/20260504210000_supporting_catalog_clean_views.sql` creates each view with the same **base-table guard** pattern as `catalog_items_clean` (refuses to create if a physical table already occupies the `_clean` name). **No `DROP` of base tables.**

## Code helpers (`src/server/db/catalogTable.ts`)

Read helpers whitelist **exactly** `{base, base_clean}` per relation (same safety model as `CATALOG_ITEMS_TABLE`). Env overrides mirror catalog items:

- `CATALOG_MODIFIERS_READ_TABLE`
- `CATALOG_BUNDLES_READ_TABLE`, `CATALOG_BUNDLE_ITEMS_READ_TABLE`
- `CATALOG_ITEM_ALIASES_READ_TABLE`
- `CATALOG_ITEM_ATTRIBUTES_READ_TABLE`
- `CATALOG_ESTIMATOR_PARAMETRIC_MODIFIERS_READ_TABLE`
- `CATALOG_ESTIMATOR_SKU_ALIASES_READ_TABLE`
- `CATALOG_ESTIMATOR_ITEM_ATTRIBUTES_READ_TABLE`

**SQLite / local:** defaults resolve to the **physical** table names (views not required).

**Postgres:** defaults resolve to the corresponding `*_clean` views once migrations are applied.

## Wired read paths (writes unchanged)

Server **SELECT** paths now interpolate the helper table names in:

- `catalogRepo.ts` — catalog search alias join; forward-facing attribute counts
- `bundlesRepo.ts` — list/get bundles and bundle lines
- `modifiersRepo.ts` — list modifiers; resolve modifier for line apply
- `catalogAliasesRepo.ts` / `catalogAttributesRepo.ts` — list helpers (SQLite legacy routes)
- `estimatorNormCatalogRepo.ts` — parametric modifiers, SKU aliases, estimator item attributes
- `intakeMatcherService.ts` — alias / attribute reads (SQLite-only runtime today)
- `takeoffRepo.ts` — attribute delta snapshots
- `legacyRouter.ts` — modifier/bundle GET and read-before-write SELECTs (updates still target base tables)
- `googleSheetsCatalogSync.ts` — bundle upsert’s modifier-key discovery **read** only

Sheet sync **INSERT/UPDATE/DELETE** continues to target **`modifiers_v1`**, **`bundles_v1`**, **`bundle_items_v1`**, etc.
