# Parser & intake — database support gaps

Ground truth for matching behavior lives in **`intakeMatcherService.ts`**, **`catalogMatcher.ts`**, **`takeoffCatalogRegistry.ts`**, **`intakeCatalogMatching.ts`** — not only in relational tables.

## What the relational model supports well

- **`catalog_items`**: SKU, model, manufacturer, series, descriptions, **`install_labor_family`**, category hints.
- **`catalog_item_aliases`** (multi-target per type/value): synonyms, vendor codes, abbreviated strings for search ranking joins.
- **`estimator_sku_aliases`**: **global unique** synonym → canonical id (resolver path after raw SKU misses).
- **`estimator_catalog_item_attributes`**: structured facets (material, mounting, partition core) usable for future parsers.
- **`intake_catalog_memory_v1`**: reinforcement of prior human picks per `memory_key`.

## Scenario coverage

| Scenario | Supported? | Notes |
|----------|------------|-------|
| “6806 grab bar 18, 36, 42” | **Partial** | Catalog rows per length OR single row + dimensional attributes; **`catalog_item_attributes`** can carry deltas if sheet maintains them — parser multiplier logic is intake-side (`interpretTakeoffHeader` / matchers). |
| Partition shorthand (“Scranton A”, phenolic compartments) | **Partial** | Family tokens + fuzzy search; **`category`** + **`notes`**/`tags` quality drives hit rate — not automatic without aliases. |
| Urinal screen shorthand | **Weak** unless aliases | Requires manufacturer + model stubs + synonym rows. |
| Accessory shorthand (B-697, KKSS, etc.) | **Good if SKUs seeded** | `estimator_sku_aliases` for cross-brand equivalents is powerful but risky — review. |
| Manufacturer block context in PDF quotes | **Partial** | `takeoff_lines_v1.source_manufacturer`, `source_section_header`, `source_bid_bucket` persist hints — **relational quote-block graph is not fully modeled**. |
| Subtotal linkage by vendor/category block | **Weak** | Intake merges metadata in **`intakePipeline`** but **vendor block → line ownership** lacks a normalized table; heuristic today. |

## Inferred opportunities

1. **Quote block entities** (`quote_blocks_v1` id, gc_section, gc_vendor_hint) keyed to `takeoff_lines_v1` — future enhancement; avoids overloading catalog table.
2. **Alias typing**: align `catalog_item_aliases.alias_type` enums across Sheets + ingestion (prevent “same string, conflicting types”).
3. **Partition dimension dictionary** mapping inch tokens → standardized attribute tokens for matching (DB table or YAML seed).
4. **Bundle-driven parse**: when OCR finds “KIT”/`SET OF`, prioritize bundle template resolution before SKU-only search.
