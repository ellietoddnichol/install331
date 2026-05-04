# Bundle gap assessment (estimator-facing)

## What exists today

- **`bundles_v1` + `bundle_items_v1`**: primary runtime bundles; synced from Sheets; referenced from takeoff lines via `bundle_id`.
- **`estimator_norm_bundles_v1`**: optional semantic grouping with **optional `legacy_bundle_id`** to `bundles_v1`; example ADA restroom seed lives in **`0003_estimator_catalog_normalization_v1.sql`**.

## Confirmed modeling characteristics

| Topic | Observation |
|-------|--------------|
| **Proposal semantics** | Bundle explosions depend on **`bundle_items_v1`** lines (qty + optional `catalog_item_id` / SKU); proposal text inherits from exploded catalog rows unless overridden downstream. |
| **Pricing semantics** | Item-level **`base_material_cost` / base labor** propagate from `catalog_items` when IDs resolve; orphaned SKUs rely on **`material_cost` / labor fields on bundle item row** — risk of **double definition**. |
| **Multi-part assemblies** | Some assemblies may incorrectly live as single `catalog_items` when estimator intent is bundle + components — requires **SKU review**, not automation-only. |

## Likely gaps (Div 10)

1. **Grab bar kits** (“6 sets of 6806 × 18/36/42”) — need either **explicit bundle definitions** OR **quantity parser rules** referencing one canonical grab bar SKU + intake dimension expansion.
2. **Partition “per compartment” assemblies** — headrail/brackets/pilasters often modeled partially; bundles should mirror **installer count logic** (LF vs compartment).
3. **ADA single-stall rest room packages** — example norm bundle seeded; expanded coverage depends on GC standard detail sets.
4. **Fire extinguisher + cabinet** — frequent pair; bundle template vs accessorized single row — **business rule** dependency.
5. **Mailbox clusters (Florentine numbering)** — may need bundles for **banks** vs individual doors.

## Inferred recommendations

1. Maintain **`bundles_v1` as SOT for UI/sync** until norm layer is wired end-to-end.  
2. Use **`legacy_bundle_id`** mapping when migrating semantic bundles → runtime bundles without changing UI ids prematurely.  
3. Add **`bundle_items_v1.sort_order`** discipline for proposal readability (already modeled).  
4. For enrichment, prioritize **kits with repeated quote evidence** across historical projects (`estimate_examples` in Brain lane, if populated).
