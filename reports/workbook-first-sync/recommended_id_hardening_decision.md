# Recommended decision: SKU-only identity (workbook-first)

**Scope:** Governance and process only — **no schema changes** in this document. Workbook-first source of truth is preserved.

## Verdict — is SKU-only acceptable *for now*?

**Conditional yes.**

| Condition | Rationale |
|-----------|-----------|
| **Prod validation pending** | The latest audit run against this machine’s `.env` did **not** complete a successful query against Supabase **`catalog_items`**. Collision and category-divergence counts are **zeros from error paths**, not from a grounded row scan. Risk cannot be closed from that artifact alone. |
| **Operational posture unchanged** | Until a passing run proves large manufacturer+SKU ambiguity, **SKU-only identity with CLEAN_ITEMS workbook discipline** remains a workable default aligned with workbook-first governance. |

If a future successful run surfaces **many** normalized SKUs with **multiple trimmed manufacturers**, reassess upward toward **`manufacturer_normalized` + SKU** preflight derivation or eventual explicit **Catalog_Item_ID** (additive, deferred here).

---

## Counts tying to the decision — *this checkout*

(from `identity_risk_remediation_queue.csv` placeholder / failed-connect path):

- **Manufacturer collision rows:** 0 (**not authoritative**)
- **Category-divergence-only rows:** 0 (**not authoritative**)
- **`priority_source`: `CLEAN_ITEMS_workbook_first`** vs **other**: **no data rows**

**Risk bucket (requested framing):**

- **Empirical bucket:** **Unset** — classified as **`strong need to harden preflight/import identity logic` only if prod later shows pervasive manufacturer collisions**; this run does **not** justify choosing “no meaningful collision risk.”
- **Interim stance:** Maintain **planned** importer warnings/blocks documented in `recommended_preflight_hardening_next.md` (SKU+manufacturer cluster, category cluster, missing SKU rules) regardless of connector status.

---

## Next steps

1. **Config:** Put a valid Supabase Postgres URI in `.env` (or `.env.local`) and ensure `DB_DRIVER=pg` when running the script.
2. **Re-run** `catalog:audit:identity-mfr-sku` and re-read **`identity_risk_remediation_queue.csv`** totals.
3. **If remediation queue is small:** treat as **manageable manual cleanup** in CLEAN_ITEMS / merge workflow.
4. **If manufacturer collision SKUs are large:** prioritize **preflight BLOCK/WARN on multi-manufacturer SKU clusters** before further bulk sync (still workbook-first).
