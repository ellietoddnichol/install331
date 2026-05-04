# Phase 7 — guarded implementation checklist

Executed to date:

- **Read-only reporting:** `npm run catalog:audit:supabase-phase` → CSV + markdown package in `reports/supabase-catalog-audit/`.
- **Existing heuristic audit:** `npm run catalog:audit` → `reports/catalog-audit/` (modifiers, bundles, CSI hints).

Recommended next merges (implement only after Wave sign-off):

1. **Migration:** optional `VIEW v_catalog_audit_active` filtering `catalog_items.active=1` excluding `deprecated=1` for UI previews (additive).  
2. **Script enhancement:** `--emit-validation-rows` piping CSV issues into **`estimator_catalog_validation_issues`** (transactional INSERT with dry-run logging).  
3. **Reference tables:** seeded `installer_labor_family` vocabulary + FK check deferred (additive column optional).  

Do **not** apply auto-Wave3 duplicate merges until takeoff FK impact report is exported (`SELECT DISTINCT catalog_item_id FROM takeoff_lines_v1 JOIN …` losers).
