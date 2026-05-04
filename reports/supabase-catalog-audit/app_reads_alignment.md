# Application read paths alignment (Phase 6)

## Primary Postgres/SQLite access

| Module | Responsibility | Key fields relied on |
|--------|----------------|----------------------|
| `catalogRepo.ts` | List/search/catalog CRUD | `sku`, descriptions, pricing, joins **`catalog_item_aliases`** for relevance |
| `catalogAliasesRepo.ts` | Alias CRUD (sheet-aligned) | `alias_type`, `alias_value`, `catalog_item_id` |
| `estimatorNormCatalogRepo.ts` | Parametric SKU resolution | `modifier_key`, `estimator_sku_aliases`, structured attributes |
| `intakeMatcherService.ts` | SQL-side alias-assisted matching | **`catalog_item_aliases`**, FTS-style filters |
| `intakeCatalogMatching.ts` | Scoring heuristic | SKU/model/manufacturer/description/category/token overlap |
| `catalogMatcher.ts` | Takeoff matrix header → catalog | Dimensions, manufacturer family tokens, SKU/model synonyms |
| `takeoffCatalogRegistry.ts` | Seeding ephemeral takeoff-derived catalog rows | **Insert paths** touching `catalog_items` — concurrency-sensitive |
| `googleSheetsCatalogSync.ts` | SOT ingestion | Bulk upsert incl. **`ON CONFLICT`**, staging rows |
| `takeoffRepo.ts` | Line persistence | **`catalog_item_id`**, SKU mirror, **`install_labor_family`**, intake metadata |

## Schema change fragility hotspots

Changing column names/types on **`catalog_items`** without mirrored updates in **`mapCatalogRow`** breaks API responses. Alias changes impact **JOIN shape** (`catalogRepo` search ranking).

Introducing **UUID-only catalog** requires adapter layer bridging existing TEXT line references — blocked until deterministic mapping established.

## View / adapter recommendation

Intermediate term:

- Keep **`catalog_items` TEXT** physical SOT + optional **`catalog_items_clean` VIEW**.  
- Add **projection view** merging modifier sources only after Wave 4 cleanup (`cleanup_sql_preview.sql` sketch).

Long term (if Brain goes prod):

- **Bridge table**: `brain_catalog_bridge(estimator_catalog_item_id TEXT, brain_catalog_uuid UUID, confidence, reviewer, created_at)`.  
- **Do not replace** estimator ids in place.

## Retrieval / AI future

Brain `knowledge_chunks` orthogonal to transactional catalog — ingestion must cite **SKU anchors** tying chunks to **`catalog_items` TEXT ids** if cross-system retrieval is desired.
