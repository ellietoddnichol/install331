# Catalog quality summary (methodology)

## How metrics are produced

| Artifact | Mechanism |
|----------|-----------|
| `table_row_counts.csv` | `COUNT(*)` per known table (presence bit in `exists` column). |
| `duplicate_candidates.csv` | Group by coalesced `manufacturer_normalized`∥manufacturer + `sku_normalized`∥`sku`; count > 1. |
| `missing_required_fields.csv` | Active rows failing **heuristic minimums:** SKU, category, manufacturer, UOM, non-negative finite labor minutes, non-empty `install_labor_family`. Tune rules in script if policy differs. |
| `suspicious_labor_minutes.csv` | Active rows: null/negative/zero/>720 minutes; partition-related rows with 1–5 minutes (PostgreSQL ILIKE heuristic; SQLite LIKE). |
| `alias_conflicts.csv` | `catalog_item_aliases`: same `lower(trim(alias_value))` mapping to multiple `catalog_item_id`. |
| `category_coverage_summary.csv` | Rows per category with active + manufacturer-fill rates. |
| `install_labor_family_coverage.csv` | Rows per labor family bucket. |
| `modifier_coverage_summary.csv` | `modifiers_v1` + `estimator_parametric_modifiers` rows plus per-category touch counts (`modifiers_v1` only). |

**Note:** `estimator_sku_aliases` uses **GLOBAL** uniqueness per `lower(alias_text)` — conflicts show up as ingest errors, not this CSV pattern.

---

## Separation: confirmed vs likely vs opportunity

### Confirmed (structural)

- Two parallel alias systems persist in schema and code (`catalog_item_aliases` vs `estimator_sku_aliases`).
- `modifiers_v1` vs `estimator_parametric_modifiers` model deltas differently (`labor_cost_multiplier` exists only on latter).
- `catalog_sheet_import_rows` + provenance columns support **replay/review**, not mandatory UI consumption.

### Likely (data-dependent — run audits)

- Duplicate SKU clusters under same manufacturer normalization.
- Missing install labor families on dense Div 10 categories.
- Zero material on “tangible” accessories (details in `reports/catalog-audit/zero_cost_items_report.csv`).

### Opportunities (design)

- Unify modifiers under one projection view while keeping legacy tables (**Phase 3** view strategy).
- Store parser “quote block context” hints as **structured metadata** separate from SKU row (currently partial via intake intake fields).

---

## Production suitability

**Production-usable catalog** implies: deterministic matching (SKU → alias → fuzzy), defensible labor for active Div 10 lines, coherent UOM/category for proposal clarity, sync provenance for dispute resolution.

Use **confidence tiers:** Tier-A auto-apply (settings thresholds), Tier-B reviewer picklist, Tier-C manual SKU — align with `intake_catalog_tier_*` in `settings_v1`.
