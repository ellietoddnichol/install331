# Target catalog standard (Phase 2)

## Purpose

Define what “good enough for commercial Div 10 estimating” means inside this codebase: **SKU integrity**, **labor realism**, **matchability**, **reviewability**.

## Layers

| Layer | Content |
|-------|---------|
| **Physical SOT** | `catalog_items` + sheet provenance columns |
| **Synonyms / search** | `catalog_item_aliases` + selective `estimator_sku_aliases` |
| **Facets / parametrics** | `catalog_item_attributes` (delta-capable), `estimator_catalog_item_attributes` (structured defs) |
| **Behavioral overlays** | `modifiers_v1` / `estimator_parametric_modifiers`, bundles |

## Confidence tiers & operations

Match decisions should classify into **tier A/B/C**:

- **A — auto:** unique manufacturer+SKU+normalized description anchor; labor present; aliases non-conflicting.  
- **B — assisted:** synonym or fuzzy family match requiring UI confirmation defaults.  
- **C — manual:** no SKU, generic description, ambiguous partition language.

Expose tier via settings (`intake_catalog_auto_apply_mode`, `intake_catalog_tier_*` thresholds).

## Provenance invariant

Every material change from Sheets should populate **`catalog_source_*`** or link to **`catalog_sheet_import_rows`** batch id whenever possible — mandatory for disputed bids.
