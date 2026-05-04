# Catalog ID strategy — workbook-first review (post SKU case-normalization)

**Scope:** CLEAN_ITEMS ingestion via **`upsertItems`** in `googleSheetsCatalogSync.ts`: **`stableKey`** → **`sheet-item-${stableKey}`**, unless SKU/description/category lookups resolve an **existing row id** (`existingRow`). **SKU / Item Key** limbs use **`workbookCatalogStableSegment()`** (trim + lowercase). Fallback: **`keyFromParts(category, itemName \|| description)`** → **20-char truncated SHA1** (with a rare nondeterministic edge if nothing hashes — see §5).

---

## 1. Identity-risk patterns (beyond case-only duplicates)

### 1.1 Same normalized SKU, multiple manufacturers (confirmed gap)

**Current derivation:** Stable segment is **SKU-only** when SKU is present — **no manufacturer dimension**.

**Risk:** Vendor A/`6806-X` vs Vendor B/`6806-X` → **same `stableKey`** → **same `catalog_items.id`** → **incorrect merge** unless rows are differentiated by SKU disambiguation in the workbook (prefix, vendor code, hyphenate MPN).

**Workbook mitigation:** SKU must encode commercial uniqueness (**OEM SKU + prefix** convention) or **`Item Key`** used as primary key when SKU is vendor-generic.

---

### 1.2 Same normalized SKU — materially different description/category

**Upsert resolves `existingRow` by `lower(sku)` first.**

**Risk:** Wrong row updated if SKU reused for a fundamentally different SKU line (spreadsheet typo or SKU recycled). Category/description divergence is **not** part of the stable id segment when SKU exists.

**Workbook mitigation:** Unique SKUs per distinct buyout identity; estimator review for SKU reuse; optionally **Manufacturer + SKU** in Item Key conventions.

---

### 1.3 Missing SKU → Item Key

**Branch:** SKU empty, non-empty **`Item Key`** → lowercased key → **`sheet-item-${itemKey}`**.

**Risks:**

- Duplicate **opaque** Item Keys reused across unrelated products (“KEY1”).
- Operators treat Item Key as **search hint** vs **immutable primary key**.
- Collision with SKU-derived IDs if somebody sets Item Key equal to someone else’s SKU string.

**Mitigation:** Treat **`Item Key` as surrogate PK only when SKU absent** — governance doc + CLEAN_ITEMS QA; preflight uniqueness on normalized Item Key subset.

---

### 1.4 Missing SKU and Item Key → hash-derived identities

**Branch:** **`keyFromParts(category, itemName \|| description)`** → **deterministic SHA1** for fixed inputs.

**Risks:**

- **Cosmetic edits** (punctuation/spacing/description rewrite) → **new hash** → **new id** → “duplicate” inactive catalog rows (`sheet-item-*` reconciliation) churn.
- **Category string drift** (“Toilet Accessories” vs “Washroom Accessories”) → new hash → duplicate rows unless category normalized first.
- **Edge:** `joined` empty falls back to hashing **`randomUUID()`** (`keyFromParts` implementation) → **different id non-deterministic per run** — **severe** if a row slips through without any non-empty part (should be blocked by **`if (!description) continue`** in normal rows; still fragile if blanks mask as content).

---

### 1.5 Item Key inconsistency / low quality

**Symptoms:** Mixed GUIDs vs human mnemonic keys; pasted Excel scientific notation corruption; stray spaces (trimmed today but not inner spaces); versioning suffixes drifting (`foo`, `foo_v2`).

**Risk:** Same product **SKU present** ignores Item Key for id (**good**) but inconsistent Item Key hurts **staging / human review**.

---

### 1.6 Resolution path skew (SKU match vs PK match vs description fallback)

Matching order (**simplified**) affects which **legacy `id`** is reused vs new **`sheet-item-*`**:

1. SKU (case-insensitive) → **`id`**.
2. **PK = `sheetDerivedId`** lookup.
3. Description + category (**fragile**) before sheet-derived fallback.

**Risk:** Thin descriptions + reused category → unintended merge.

---

## 2. Is the current derived-ID strategy strong enough long-term?

**Strong enough short–medium term** if:

- SKUs are **globally unique in practice** across manufacturers (encoding discipline), and
- Rows **always carry SKU** except rare intentional generics guarded by **`Item Key`**, and
- CLEAN_ITEMS **`description` / `category` stable** where hash fallback is used.

**Not strong enough** as **sole canonical identity** for Div 10 when:

- SKU collisions across OEMs occur, or  
- Rows regularly lack SKU, relying on hashes, or  
- Procurement uses **explicit stable row GUIDs** unrelated to SKU.

Then add **explicit `Catalog_Item_ID`** (recommended in `recommended_long_term_id_strategy.md`) with preflight UNIQUE checks.

---

## 3. Non-destructive audit SQL (populate `identity_risk_candidates.csv`)

Exports live in **`identity_risk_candidates.csv`** (pattern rows + placeholders). Executable queries duplicated in **`id_collision_candidates.sql`** for SKU dupes — extend with normalized-SKU-vs-manufacturer report:

```sql
-- Same SKU (case-normalized), different manufacturer (SQLite example)
SELECT lower(trim(sku)) AS sku_norm,
       COUNT(*) AS row_count,
       COUNT(DISTINCT lower(trim(REPLACE(REPLACE(IFNULL(manufacturer,''), ' ', ''), '-', '')))) AS pseudo_mfr_diversity,
       GROUP_CONCAT(DISTINCT id) AS ids
FROM catalog_items
WHERE sku IS NOT NULL AND trim(sku) <> ''
GROUP BY sku_norm
HAVING COUNT(DISTINCT IFNULL(trim(manufacturer), '')) > 1;
```

(PostgreSQL: swap `GROUP_CONCAT` → `string_agg`, `IFNULL` → `COALESCE`.)

Operators paste results into **`identity_risk_candidates.csv`** extended columns **`sku_norm`, `id_list`** for triage — or run `npm run catalog:publish:blockers` + manual filter.

---

## 4. Schema posture (this review)

Per constraints: **no schema change mandated** yet. Prefer **preflight workbook rules** + optional future **`Catalog_Item_ID`** header mapping + **`estimator_catalog_validation_issues`** before adding DB constraints.
