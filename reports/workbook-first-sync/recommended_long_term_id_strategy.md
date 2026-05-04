# Recommended long‑term workbook-first catalog `id` strategy

## Recommendation summary

Use a **precedence-derived stable key** until an optional **explicit workbook primary key column** ships; migrate to **`Catalog_Item_ID`** when SKU alone cannot guarantee estimator-grade uniqueness across OEMs.

---

## Phase A (now — minimal schema)

**Precedence for `stableKey` derivation (conceptual — implement incrementally):**

| Priority | When | Stable segment rationale |
|---------|------|---------------------------|
| 1 | **Explicit workbook `Catalog_Item_ID`** populated (future column) — non-empty UNIQUE | Human-governed primary key (`trim`, optional format validation). Overrides all derived ids. **`sheet-item-*` absent for those rows.** |
| 2 | **SKU present** AND **Manufacturer present** → composite `mfg|sku` normalization | Addresses **SKU collision across manufacturers** without exploding row count arbitrarily. Normalize: `trim` + **lower SKU** + **stable manufacturer normalization** (`manufacturer_normalized` style). |
| 3 | **SKU only** present | Existing behavior after casefold — viable when SKU policy proves globally unique (`sheet-item-{sku_lc}` today). |
| 4 | **Item Key only** | Lowercase key — surrogate PK discipline required. |
| 5 | **Hash fallback** — category + description + item name | **Last resort.** Require **SKU or Item Key** for “production active” tiers via workbook policy before sync. Improve hash inputs with **frozen `canonical_sku`** + **`category_main`** only after governance normalizes taxonomy. |

**Preflight gates (recommended, no DDL):**

- **Block publish** rows: missing SKU **and** missing Item Key **and** ambiguous hash inputs.
- Flag **SKU + multiple manufacturers** clusters (CSV/export).
- Flag **SKU with divergent canonical_sku/description** deltas above threshold — **manual curation.**

---

## Phase B (recommended next schema — non-destructive additive)

Optional column on **`catalog_items`**: workbook-supplied **`row_uid`** mirrored from **`Catalog_Item_ID`** OR store in **`duplicate_group_key` / estimator_notes`** **only short-term hacks** discouraged.

Cleaner: **new nullable column `workbook_catalog_item_uid TEXT UNIQUE`** populated when header present — **additive migration**, backfill empty for legacy **`sheet-item-*`**. Reads remain `*_clean` views projecting base table — **zero read-model break** if nullable.

Rollout sketch:

1. Add column nullable UNIQUE where not null.  
2. Sync maps header → column when set.  
3. Derivation precedence **1 explicit uid** → else composite → else SKU → else Item Key → else hash.

No destructive deletes; old ids remain referenced by takeoffs.

---

## Workbook conventions (operational)

- **SKU** = priceable unit identity scoped by **commercial reality** — include OEM prefix (`BOB-B-697`, not bare `697` across brands unless policy says so).
- **`Item Key`** immutable per row lifecycle; hide from editors who might “fix” casually.
- **Avoid hash-only identities** except rare generic placeholders tagged **inactive** until SKU assigned.

---

## Decision table

| If your shop… | Prefer |
|----------------|--------|
| SKUs globally unique OEM-wide | SKU-only derivation + casefold ✅ *current baseline* |
| Same numeric codes across OEMs frequently | **`manufacturer_normalized` + SKU`** composite derivation **before** Phase B DDL |
| Need audit-grade traceability unrelated to SKU | **`Catalog_Item_ID`** column (**Phase B**) |

---

## What not to do

- **Do not delete** legacy `catalog_items.id` ties to **`takeoff_lines_v1`**. Migrate by **aliases + deactivated duplicates** (`active`, `deprecated`, `duplicate_group_key`) per workbook-first playbook.
- **Avoid** changing hash inputs often — causes silent id churn.

