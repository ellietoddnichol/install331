# Workbook edit targets by sync review queue

Queue keys align with **`CATALOG_REVIEW_QUEUE_KEYS`** in `src/shared/catalogReviewQueues.ts` and CSV export `queue=` parameter.

Naming note: importer messages sometimes say **ITEMS sheet** historically; workbook-first authoring targets **CLEAN_ITEMS** (`GOOGLE_SHEETS_TAB_CLEAN_ITEMS` / precedence rules). Prefer editing **governed** tabs below.

---

## 1. `duplicate_sku_groups`

| Aspect | Detail |
|--------|--------|
| Issue types | Same **canonical SKU** (or normalization collision) resolving to multiple live rows; split-brain descriptions/labor/material. |
| Primary tab | **CLEAN_ITEMS** |
| Secondary | **ALIASES** if duplicates differ only by marketing code (**b** alias instead of duplicate item). |
| Avoid | Turning **staging ITEMS** into second source — consolidate on CLEAN_ITEMS winners. |

**Remediation skew:** (**b**) pick canonical → (**c**) deactivate losers → (**a**) fix stray SKU typos causing false dupes.

---

## 2. `alias_collisions`

| Aspect | Detail |
|--------|--------|
| Issue types | Normalized alias text maps to **multiple** canonical targets; importer cannot choose safely. |
| Primary tab | **ALIASES** |
| Secondary | **CLEAN_ITEMS** if targets should not both exist (duplicate items). |

**Remediation skew:** (**b**) intentional split → different alias strings; (**a**) one target is wrong typo.

---

## 3. `orphan_bundle_skus`

| Aspect | Detail |
|--------|--------|
| Issue types | Bundle child **SKU** not found vs catalog canonical set (missing row or typo). |
| Primary tab | **BUNDLES** (fix SKU tokens) |
| Secondary | **CLEAN_ITEMS** (add missing SKU) |

**Remediation skew:** (**a**) typo; (**c**) deactivate bundle line pending SKU (**b** curated add).

---

## 4. `unknown_modifiers`

| Aspect | Detail |
|--------|--------|
| Issue types | Bundle references **modifier_key** absent from governed modifier catalog. |
| Primary tab | **MODIFIERS** (define key / label / JSON categories) |
| Secondary | **BUNDLES** (correct key spelling) |

**Remediation skew:** (**a**) typo vs **MODIFIERS.modifier_key**; (**b**) genuinely new modifier — add governed row.

---

## 5. `orphan_attribute_skus`

| Aspect | Detail |
|--------|--------|
| Issue types | **ATTRIBUTES.Canonical_SKU** (or equivalent) does not resolve to an item SKU in scope. |
| Primary tab | **ATTRIBUTES** |
| Secondary | **CLEAN_ITEMS** (create stub item) |

**Remediation skew:** (**a**) SKU mismatch; (**c**) deactivate attribute row for retired item.

---

## 6. `orphan_alias_skus` *(same importer family as aliases)*

| Aspect | Detail |
|--------|--------|
| Issue types | **ALIASES** target canonical SKU missing from curated item set. |
| Primary tab | **ALIASES** (correct **Canonical_SKU** / resolver column per sheet mapping) |
| Secondary | **CLEAN_ITEMS** (add target item) |

**Remediation skew:** (**a**) canonical typo; (**b**) add item vs remove alias (**c**) if speculative.

---

## 7. `labor_outliers`

| Aspect | Detail |
|--------|--------|
| Issue types | Minutes null/zero/extreme/heuristic clash with partition/accessory-heavy category text. |
| Primary tab | **CLEAN_ITEMS** |
| Secondary | **ATTRIBUTES** when labor deltas are modeled per facet |

**Remediation skew:** (**b**) estimator-validated minutes; (**d**) threshold tuning **after** SKU/alias integrity intact.
