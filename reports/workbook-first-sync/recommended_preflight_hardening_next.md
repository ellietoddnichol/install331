# Recommended preflight hardening (next, no schema yet)

Based on `catalog_id_strategy_review.md`, `identity_risk_candidates.csv`, and this audit run.

## 1. Blocking / warning rules (importer)

| Rule | Severity | Notes |
|------|----------|------|
| **SKU + manufacturer cluster** — `COUNT(DISTINCT trim(manufacturer))` > 1 per `lower(trim(sku))` | **BLOCK** or **WARN** | Align with operator policy; BLOCK prevents silent merge identity. |
| **SKU + category cluster** — multiple categories for same normalized SKU (after mfr check passes) | **WARN** | Often safe workbook category normalization. |
| **Missing SKU** on active publish row | **WARN** → **BLOCK** | Require Item Key or explicit future `Catalog_Item_ID`. |
| **Hash-only identity** (no SKU, no Item Key) for **active** row | **BLOCK** | Prevents unstable `sheet-item-` churn. |

## 2. Workbook-first governance

- Enforce **OEM-prefixed SKUs** in CLEAN_ITEMS when numeric collision risk exists (e.g. Bobrick vs Bradley same style number).
- Document **one row = one buyout identity**; split rows before sync when manufacturers differ.

## 3. Future code (after policy sign-off)

- Derive stable segment from **normalized `manufacturer_normalized` + SKU** when both present (see `recommended_long_term_id_strategy.md`).
- Optional **`Catalog_Item_ID`** column mapping — additive DB column when ready.

## 4. This environment

- Remediation rows written: **1** (includes placeholder row if DB returned no collisions).
