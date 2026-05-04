# Catalog audit (Phase 1)

**Read-only.** The audit reads `catalog_items`, `modifiers_v1`, `bundles_v1`, and `bundle_items_v1` from your configured database (SQLite or Postgres via `DB_DRIVER=pg` + `DATABASE_URL`). It does **not** import seed rows, call Google Sheets, or modify data.

## How to run

```bash
npm run catalog:audit
```

- **Default:** local SQLite at `estimator.db` (or the path from `SQLITE_PATH` / `SQLITE_DB`), with `DB_DRIVER=sqlite` or unset.
- **Postgres (e.g. Supabase):** set `DB_DRIVER=pg` and `DATABASE_URL=postgresql://...` the same way as the app.

Outputs are written to `reports/catalog-audit/`. That folder is listed in `.gitignore` for `*.csv` so large or sensitive reports are not committed; keep `reports/catalog-audit/.gitkeep` so the path exists in git.

## Files produced

| File | Contents |
|------|----------|
| `catalog_audit_report.csv` | All issues (one row per finding). |
| `issue_counts_by_type.csv` | Aggregated counts by `issue_type`. |
| `duplicate_sku_report.csv` | Rows sharing the same non-empty normalized SKU. |
| `likely_duplicate_name_report.csv` | Rows sharing a normalized `family` / `description` key. |
| `uom_anomaly_report.csv` | UOM not in the allowlist, or heuristics (e.g. partitions as EA, wall protection as EA). |
| `modifier_math_error_report.csv` | Suspect flat-vs-percent storage and odd percent magnitudes. |
| `zero_cost_items_report.csv` | Active items with $0 base material (excluding obvious non-product phrases). |
| `category_mapping_report.csv` | Missing or unmapped MasterFormat/CSI context (heuristic). |
| `legacy_alias_candidates.csv` | `sheet-item-*` ids or deprecated phrasing. |
| `variant_token_report.csv` | SKUs/descriptions with variant tokens (candidates to become attributes). |
| `delimiter_and_json_report.csv` | Tags/JSON/delimiter inconsistencies. |
| `bundle_reference_report.csv` | Bundle lines pointing at missing catalog items or odd SKU text. |

## Issue types

Defined in `src/shared/types/catalogValidationIssue.ts` for alignment with a future `catalog_validation_issues` table. Types include: duplicate SKU/name clusters, UOM issues, zero-cost tangible lines, CSI mapping gaps, modifier math suspects, bundle references, and delimiter/JSON parse issues.

## Notes

- Until a `csi_code` (or similar) column exists on `catalog_items`, the audit may infer likely Division 10 section codes from **category** only. Treat as guidance, not a compliance certification.
- **Modifier math** flags are heuristics (e.g. percent-like flat amounts); confirm against your spreadsheet convention before mass updates.

For the full multi-phase program, see `docs/CURSOR_CATALOG_ACTION_PLAN.md`.
