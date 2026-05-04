# Manufacturer + SKU collision summary

Generated: **2026-05-04T19:06:14.133Z**  
DB driver: **pg**

## Counts

| Metric | Value |
|--------|------:|
| Rows in **manufacturer collision** detail | 0 |
| Distinct **normalized SKUs** (mfr collision) | 0 |
| Rows in **category divergence** (excluding mfr-collision SKUs) | 0 |
| Distinct **normalized SKUs** (category-only) | 0 |

## Interpretation

- **Manufacturer collision:** same `lower(trim(sku))` assigned to **multiple distinct manufacturer strings** (trimmed). High risk for **merged `catalog_items.id`** under SKU-only `sheet-item-` derivation.
- **Category divergence:** same normalized SKU with **multiple category values** and **not** already in the mfr-collision set — often **taxonomy cleanup** in CLEAN_ITEMS; escalate to **manual identity review** if descriptions differ materially.

## Output

- Concrete queue: `identity_risk_remediation_queue.csv`
- Preflight next steps: `recommended_preflight_hardening_next.md`
