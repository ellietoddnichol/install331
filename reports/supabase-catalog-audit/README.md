# Supabase / catalog audit package

This folder holds **Phase 1+** auditor-facing artifacts for the **estimator-lineage** catalog (`TEXT catalog_items`). Regenerate quantitative outputs against your Supabase snapshot:

```powershell
npm run catalog:audit:supabase-phase
DB_DRIVER=pg DATABASE_URL="<service_role_or_pooler_conn>" npm run catalog:audit:supabase-phase
```

Sibling reports (modifiers/bundles/CSI heuristics): `reports/catalog-audit/` via `npm run catalog:audit`.

**Start here**

- `FIRST_PASS_SUMMARY.md` — executive framing, ranked lists, sequence.
- `schema_inventory.md` — tables/views, FKs, SOT vs staging.
- CSV files in this directory — row counts, duplicates, missing fields, labor outliers, alias conflicts, category/labor/modifier coverage.

**Phases 2–3**

- `target_catalog_standard.md`, `canonicalization_rules.md`, `required_fields_and_validation.md`
- `cleanup_plan.md`, `cleanup_sql_preview.sql`, `manual_review_queue.csv`

**Phase 5–6**

- `enrichment_plan_div10.md`
- `app_reads_alignment.md`

**Assumptions:** Document every transformation in downstream SQL/scripts; prefer **deactivate** (`active=0`, `deprecated=1`) over destructive deletes.
