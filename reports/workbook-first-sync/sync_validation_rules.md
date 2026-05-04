# Sync validation rules (pre-publish)

Run **validation + reports before** treating a workbook snapshot as production-published. Prefer extending existing scripts over one-off SQL.

## Alignment with existing tooling

| Report / rule | Source |
| --- | --- |
| Row counts, duplicate manufacturer+SKU keys | `scripts/supabase-catalog-phase-audit.ts` → `reports/supabase-catalog-audit/duplicate_candidates.csv`, `table_row_counts.csv` |
| Missing required fields (active rows) | `missing_required_fields.csv` (SKU, category, manufacturer, UOM, labor, `install_labor_family`) |
| Suspicious labor | `suspicious_labor_minutes.csv` |
| Alias conflicts (same normalized alias → multiple items) | `alias_conflicts.csv` |
| Category / install-labor-family coverage | `category_coverage_summary.csv`, `install_labor_family_coverage.csv`, `modifier_coverage_summary.csv` (if generated) |
| Sheet-side row hygiene | `validateSheetRows()` in `googleSheetsCatalogSync.ts` — trims cells, drops fully empty rows |

**Commands:** `npm run catalog:audit`, `npm run catalog:audit:supabase`, `npm run catalog:audit:supabase-phase` (see `package.json`).

## Proposed pre-publish checklist (sheet + DB)

### CLEAN_ITEMS / `upsertItems`

| Rule | Rationale |
| --- | --- |
| **Required:** at least one of **Description** or **Item/Name** column per data row | Else row skipped; throws if headers missing both. |
| **SKU recommended:** stable **SKU** or **Item Key** | Warning if neither header found; fallback keys are hash-based (`sheet-item-*`). |
| **Material column present** | Warning if no price column matched; imports **0** cost. |
| **Duplicate stable keys in one tab** | Last row wins (documented in code); flag in validation report if duplicates exist. |
| **Canonical SKU uniqueness** | After normalize (`normalizeSku` / `sku_normalized`), flag collisions for **active** rows (`duplicate_candidates` style). |
| **Category / `category_main`** | `mapCategoryMain` may return **null** for unknown categories — flag **uncategorized** buckets for review (`ESTIMATOR_CATEGORY_MAIN_BUCKETS` in `catalogNormalization.ts`). |
| **Units** | `normalizeUnit` maps known synonyms; unknown → uppercased slice — flag **nonstandard UOM** list for review. |
| **URLs** | If `image_url` set: must be **https** or acceptable app path — flag malformed. |
| **Labor** | Non-negative; align with **`suspicious_labor_minutes`** heuristics (zero, very high, partition + very low). |
| **Booleans** | `Active` parsed via `parseBoolean` — unknown tokens default **true** (risk: typos stay active). |

### MODIFIERS

| Rule | Rationale |
| --- | --- |
| **Name or key present** | Else row skipped. |
| **Applies-to categories non-empty** | Warning emitted if empty — modifiers may not apply as intended. |

### BUNDLES

| Rule | Rationale |
| --- | --- |
| **Bundle name required** | Row skipped otherwise. |
| **Each included SKU** must resolve in **`catalog_items`** (via normalized SKU map) | Warning **`unknown SKU`** already emitted. |
| **Each included modifier** must match **`modifiers_v1.modifier_key`** (canonical match) | Warning **`unknown modifier`**. |
| **At least one SKU** | Warning if none. |

### ALIASES

| Rule | Rationale |
| --- | --- |
| Headers: **Canonical_SKU**, **AliasType**, **AliasValue** | Else tab skipped. |
| **Canonical_SKU** must resolve to **`catalog_items.id`** | Warning + row skipped (`resolveCatalogItemIdFromCanonicalSku`). |
| **Inactive rows** | Skipped (no delete of DB aliases). |
| **Global alias conflicts** | Run **`alias_conflicts.csv`** after sync. |

### ATTRIBUTES

| Rule | Rationale |
| --- | --- |
| Headers: **Canonical_SKU**, **AttributeType**, **AttributeValue** | Else tab skipped. |
| **SKU resolution** | Same as aliases. |
| **Percent deltas** | Decimal **0.1** normalized to **10%** with warning (sheet ambiguity). |
| **`material_delta_type` / `labor_delta_type`** | Must be one of normalized types (`absolute`, `percent`, `minutes`, etc.) or stored as raw if unrecognized — review. |

## Implementation notes

- **Dry-run mode** (future): fetch tabs, run validators, write JSON/CSV under `reports/` without `withCatalogSyncWriteTransaction`.
- **No destructive deletes:** validation failures should **block promote**, not auto-delete workbook or DB rows.

---

*Cross-reference: `workbook_cleanup_findings.md` for spreadsheet-side risks that surface as validation noise.*
