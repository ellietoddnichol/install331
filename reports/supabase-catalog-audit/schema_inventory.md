# Schema inventory — catalog & related tables

Convention: **`public`** schema unless noted. Column lists reflect **combined** migrations (`0001` + `20260430131500` provenance/`20260504140000`/`20260504180000`). Actual deployment may omit some migrations — use `information_schema` or regenerate `table_row_counts.csv`.

Legend: **SOT** = source of truth · **DRV** = derived · **STG** = staging · **OBS** = optional / parallel experiment

---

## Estimator-lineage core (TEXT `catalog_items`)

### `catalog_items` (SOT for estimating app)

- **PK:** `id` TEXT  
- **Uniqueness:** PK only; **no** UNIQUE on `sku` (duplicates possible — audit `duplicate_candidates.csv`).  
- **FK referenced by:** `takeoff_lines_v1.catalog_item_id`, `bundle_items_v1.catalog_item_id`, `intake_catalog_memory_v1.catalog_item_id`, `catalog_item_aliases.catalog_item_id`, `catalog_item_attributes.catalog_item_id`, `estimator_sku_aliases.target_catalog_item_id`, `estimator_catalog_item_attributes.catalog_item_id`, `estimator_norm_bundle_items_v1.catalog_item_id`.

**Baseline columns (0001):** `sku`, `category`, `subcategory`, `family`, `description`, `manufacturer`, `brand`, `model`, `model_number`, `series`, `image_url`, `uom`, `base_material_cost`, `base_labor_minutes`, `labor_unit_type`, `taxable`, `ada_flag`, `tags`, `notes`, `active`, `install_labor_family`.

**Governance (20260430131500):** `canonical_sku`, `is_canonical`, `alias_of`, `labor_basis`, `default_mounting_type`, `finish_group`, `attribute_group`, `duplicate_group_key`, `deprecated`, `deprecated_reason`, granularity/material/system/privacy/configuration flags, `default_unit`, `estimator_notes`, etc.

**Provenance/normalization (20260504140000):** `catalog_source`, `catalog_source_tab`, `catalog_source_row`, `catalog_sync_batch_id`, `sku_normalized`, `manufacturer_normalized`, `category_main`, `item_type`.

**App flows:** Sheets sync (`googleSheetsCatalogSync.ts`), CRUD/catalog UI (`catalogRepo.ts`), intake matching (`intakeMatcherService.ts`, `intakeCatalogMatching.ts`, `catalogMatcher.ts`), takeoff persistence (`takeoffRepo.ts`), bundle picker, proposals (via line + catalog hydration).

### `catalog_items_clean` (DRV)

- **View** aliasing `SELECT * FROM catalog_items` (`20260430130000`). Not a separate table. Avoid creating a physical `catalog_items_clean` base table without dropping the view first.

---

## Modifiers & bundles (estimator runtime)

### `modifiers_v1` (SOT)

- **PK:** `id` TEXT  
- **Semantics:** flat add (`add_labor_minutes`, `add_material_cost`) + percent (`percent_labor`, `percent_material`), `applies_to_categories` as **JSON string** array.  
- **Flows:** Line modifiers (`line_modifiers_v1`), catalog admin, proposal labor/material composition.

### `estimator_parametric_modifiers` (SOT — parallel normalized model)

- **PK:** `id` TEXT, **`modifier_key` UNIQUE**  
- Includes **`labor_cost_multiplier`** (not on `modifiers_v1`).  
- **Flows:** `estimatorNormCatalogRepo.ts` — used for estimator-specific parametric uplift rules; keep consistent with `modifiers_v1` or document intentional divergence.

### `bundles_v1` + `bundle_items_v1` (SOT)

- User-facing bundles; **`bundle_items_v1.catalog_item_id`** optional with legacy `sku` text.  
- **Flows:** Item picker, estimate builder, Sheets sync for BUNDLES tab.

### `estimator_norm_bundles_v1` + `estimator_norm_bundle_items_v1` (OBS / future normative)

- Parallel “norm bundle” model with optional `legacy_bundle_id` pointer.  
- **Flows:** Not wired to all UI paths — treat as **staging / design layer** until explicitly adopted.

---

## Aliases & attributes

### `catalog_item_aliases` (SOT — sheet sync)

- **Unique:** `(catalog_item_id, alias_type, alias_value)`  
- **Flows:** `googleSheetsCatalogSync`, `catalogAliasesRepo`, `intakeMatcherService` (SQL `FROM catalog_item_aliases`), `catalogRepo` search ranking (LEFT JOIN aliases).

### `estimator_sku_aliases` (SOT — normalization layer)

- **Unique:** `lower(alias_text)` index — one global resolution per alias string.  
- **Flows:** `estimatorNormCatalogRepo.resolveCatalogItemId` — resolves code → `catalog_items.id` after SKU match fails.

### `estimator_catalog_attribute_defs` + `estimator_catalog_item_attributes` (SOT)

- Structured attributes (material, mounting, partition core, etc.).  
- **Flows:** `estimatorNormCatalogRepo` attribute reads; optional UI / future parametrics.

### `catalog_item_attributes` (SOT — sheet tab)

- Richer row shape (material/labor deltas per attribute value). Synced from Sheets.  
- **Distinct from** `estimator_catalog_item_attributes` — do not merge without a migration plan.

---

## Staging, sync, validation

### `catalog_sheet_import_rows` (STG)

- Raw cell JSON per sheet row for audit/debug.

### `catalog_sync_status_v1` (DRV snapshot)

- Operator-facing last sync message + counters.

### `catalog_sync_runs_v1` (STG/history)

- Per-attempt outcomes.

### `estimator_catalog_validation_issues` (STG/review — intended)

- `issue_type`, `entity_kind`, `entity_id`, `status`, `severity`, `detail_json`.  
- **Underutilized until** audit pipeline writes here.

---

## Settings & intake memory

### `settings_v1` (SOT)

- Company + **intake catalog auto-apply** thresholds (`intake_catalog_auto_apply_mode`, `intake_catalog_tier_a_min_score`).

### `intake_catalog_memory_v1` (DRV)

- Learned `memory_key` → `catalog_item_id` with hit counts.

### `takeoff_lines_v1` (SOT)

- References catalog via `catalog_item_id`, `sku`, `install_labor_family`, intake metadata (`intake_scope_bucket`, `intake_match_confidence`, manufacturer/section hints).

---

## Div 10 Brain (UUID model) — **separate lineage**

Defined in **`20260414120000_div10_brain_init.sql`**:

| Object | Role |
|--------|------|
| `catalog_items` (uuid, sku UNIQUE) | Brain SOT if this migration applied |
| `catalog_aliases` | UUID-target aliases |
| `modifier_rules` | Category-scoped rules |
| `bundle_templates` / `bundle_template_items` | Template layer |
| `knowledge_documents` / `knowledge_chunks` | RAG / embeddings |
| `estimate_examples` / `training_examples` / `ai_run_logs` | ML / audit |

**Collision warning:** same relation name `catalog_items` as estimator baseline — **only one** should exist in a given database.

---

## Null-prone & stale-risk columns (heuristic)

- **`install_labor_family`**, **`labor_basis`**, **`duplicate_group_key`**, **`alias_of`**: often unset in sheet-only shops.  
- **`tags`**: must remain valid JSON array when used.  
- **Brain-only columns** (if unused): N/A for estimator DB; ignore until Brain is adopted.

---

## Production readiness (schema-level)

Schema supports **production** estimating when: migrations are consistent (single `catalog_items` lineage), sync writes succeed, and validation issues are triaged. **Data** readiness requires row-level audit (CSV reports), not schema presence alone.
