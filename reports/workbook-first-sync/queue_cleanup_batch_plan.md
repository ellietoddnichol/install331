# Queue-driven workbook cleanup — batch plan (structural-first)

Governed tabs (prefer edits here only): **CLEAN_ITEMS**, **ALIASES**, **ATTRIBUTES**, **MODIFIERS**, **BUNDLES**.

Non-governed tabs (**ITEMS**, **LEGACY_ITEMS**, etc.) stay **staging/reference** per `sync_precedence_rules.md` — fixes that “belong” in production catalog should land on governed tabs before sync relies on staging.

Remediation legend:

| Tag | Meaning |
|-----|---------|
| **a** | Safe direct workbook fix (rename, typo, align key, deactivate row) |
| **b** | Manual curation (estimator chooses canonical vs duplicate, mount/material nuance) |
| **c** | Deactivate / exclude from publish (set **Active** off or retire row — **never hard-delete**) |
| **d** | Sync/parser rule — only when repeated systematic false positives/outliers |

---

## Phase 0 — Freeze & export (same day)

1. Run **Sync Catalog** once (captures audit + queues).  
2. Download CSV per queue (**Manual review queues**).  
3. Optional: `npm run catalog:publish:blockers` for cross-check.  
**Goal:** deterministic line list before editing.

---

## Phase 1 — Duplicate SKU groups (`duplicate_sku_groups`)

**Structural priority #1.** Colliding **canonical SKU** keys break publish confidence and importer identity.

**Edits:** **CLEAN_ITEMS** (primary); confirm no duplicate **SKU** / **canonical_sku** (per manufacturer if your workbook encodes manufacturer-scoped uniqueness).

**Default approach:** (**b**) pick one **canonical winner** row; (**c**) losers **inactive** (`active=0` / workbook equivalent) **or** merge fields into winner then (**a**) narrow SKUs — never delete historic ids if rows already synced (prefer deactivate).

**Risk:** (**b**) if labor differs between duplicates — do not (**a**) until labor reconciled.

**Exit criterion:** Preflight clears “duplicate canonical sku” blocking lines; CSV queue empty after re-sync.

---

## Phase 2 — Alias multi-target (`alias_collisions`)

**Structural priority #2.** One alias string must not resolve to competing catalog identities.

**Edits:** **ALIASES** (primary); optionally **CLEAN_ITEMS** if the collision is SKU drift on item rows.

**Approach:** (**b**) designate single target **canonical_sku** per alias variant; (**a**) split aliases if intentional (two products should not share same alias text).

**Exit criterion:** No `ALIASES: alias key` collision classifiers remaining.

---

## Phase 3 — Bundles integrity (`orphan_bundle_skus`, `unknown_modifiers`)

**Structural priority #3.** Bundle explosions must reference real SKUs and real modifier keys.

**Edits:** **BUNDLES** / bundle-line columns (primary); **CLEAN_ITEMS** (add/fix missing SKUs); **MODIFIERS** (add missing keys or rename bundle refs to **`modifier_key`** match).

**Orphan SKU:** (**a**) fix typo casing vs CLEAN_ITEMS SKU; (**b**) intentional component not yet curated — add CLEAN_ITEMS stub or deactivate bundle line (**c**) until SKU exists.

**Unknown modifier:** (**a**) rename bundle column to existing **MODIFIERS.modifier_key**; (**d**) only if catalogs systematically mis-keyed vs sync mapping.

**Exit criterion:** No `included sku … not found` / `unknown modifier` lines.

---

## Phase 4 — Attribute anchors (`orphan_attribute_skus`, optional `orphan_alias_skus`)

**Structural priority #4.**

**Tabs:** **ATTRIBUTES**; **ALIASES** for `orphan_alias_skus` (canonical_sku typo); **CLEAN_ITEMS** to add absent canonical rows.

**Approach:** (**a**) canonical_sku aligns to CLEAN_ITEMS SKU; (**b**) if attribute applies to discontinued item — deactivate attribute row (**c**).

---

## Phase 5 — Labor outliers (`labor_outliers`)

Lower **structural** priority than identity/refs; higher **financial** priority once keys are stable.

**Edits:** **CLEAN_ITEMS** (base labor / category); sometimes **catalog_item_attributes**-style deltas if your sheet models mount/material labor in **ATTRIBUTES**.

**Approach:** Mostly (**b**) estimator review against install family; (**d**) if repeated category-wide false flags, tune preflight thresholds **after** data is sane.

---

## Cadence

- Complete **Phase 1–2** before large attribute/bundle enrichment.  
- Re-sync after **each phase** or every ~30 edits to keep queues short.  
- Never batch-enrich until **duplicate + alias collision** queues are cleared or explicitly waived.

---

## Automation / schema

None required for this plan — operators use CSV + workbook. Optional future: scripted diff against CLEAN_ITEMS SKU index (read-only linter).
