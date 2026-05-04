# First pass summary — catalog / Supabase audit

**Scope:** Estimator-lineage catalog (TEXT `catalog_items`, modifiers, bundles, sheet sync, intake). Div 10 Brain UUID tables are documented in `schema_inventory.md` as a **separate optional layer**.

**Method:** Schema derived from `supabase/migrations/` and `src/server/db/schema.ts`. Row-level findings are **environment-specific** — run `npm run catalog:audit:supabase-phase` and `npm run catalog:audit` against production snapshots (or anonymized copies) for authoritative counts.

---

## Executive summary

The app’s production path centers on **`catalog_items` (TEXT id)** plus **`modifiers_v1`**, **`bundles_v1`**, **`catalog_item_aliases`** (sheet sync), and optional **`estimator_*`** normalization tables (parametric modifiers, SKU aliases, attribute defs, norm bundles, validation issues). **Provenance** is supported via **`catalog_sheet_import_rows`** and columns such as `catalog_source`, `catalog_sync_batch_id`, `sku_normalized`, `manufacturer_normalized`, `category_main`, `item_type` (`20260504140000_*`).

**Risk:** If both **estimator baseline** and **Div 10 Brain** migrations were ever applied to the same database, they would collide on `public.catalog_items`. Confirm active migration track before any cleanup.

**Strength:** Google Sheets sync + staging give **reviewable import history**; the app already has **read-only audit scripts** (`catalog-audit.ts`, this package).

**Gap:** Estimator intelligence is split across **sheet aliases** (`catalog_item_aliases`, used in search/matching) and **estimator SKU aliases** (`estimator_sku_aliases`, used in `estimatorNormCatalogRepo` resolution). Two alias systems require **operational discipline** to avoid drift and conflicting targets.

---

## Top 10 data quality issues (typical; confirm on your DB)

1. **Duplicate manufacturer + SKU** — multiple `catalog_items` rows for the same commercial identity (see `duplicate_candidates.csv`).
2. **Missing `install_labor_family` on active rows** — weak labor defaults for takeoff and proposal logic.
3. **Active rows with null/empty SKU, category, manufacturer, or UOM** — breaks matching and scope review confidence (`missing_required_fields.csv`).
4. **Labor minutes null, zero, or extreme** on install-heavy categories — estimator outcome risk (`suspicious_labor_minutes.csv`).
5. **Alias collisions** in `catalog_item_aliases` — same normalized text resolves to multiple item ids (`alias_conflicts.csv`).
6. **Variant tokens trapped in SKU/description** — should often be attributes or aliases (`catalog_audit_report.csv` variant section).
7. **Bundle/component drift** — `bundle_items_v1` references SKUs or ids that no longer exist after sync churn.
8. **Modifier JSON / percent semantics** — `applies_to_categories` parse errors vs “0.08 vs 8%” ambiguity (`modifier_math_error_report.csv` in sibling folder).
9. **Inactive vs deprecated vs duplicate groups** — `deprecated`, `duplicate_group_key`, `alias_of` underused relative to governance columns added in migrations.
10. **`estimator_catalog_validation_issues` under-populated** — issues live in CSV reports but may not feed a durable review queue yet.

Severity mapping:

- **Breaks production logic:** dangling bundle refs; sync failures that roll back writes; malformed JSON in modifiers.
- **Bad estimator outcomes:** wrong labor/UOM/category; duplicate SKUs resolving unpredictably.
- **Matching ambiguity:** alias conflicts; sparse aliases; overly generic descriptions.
- **Maintenance pain:** duplicate clusters; unstaged Sheets vs DB provenance mismatches.

---

## Top 10 coverage gaps (Div 10 – estimator lens)

1. **Toilet partitions / screens / headrail variants** — dimensional and material forks need aliases + labor families.
2. **Urinal screens / divider shorthand** — parser tokens vs sparse catalog clusters.
3. **Grab bar “sets” and multi-length callouts** (e.g. 18 / 36 / 42) — bundle or attribute model clarity.
4. **Wall protection** — LF vs EA consistency and labor calibration by product line.
5. **Lockers / storage** — often thin generic rows vs manufacturer-backed lines (Salsbury, etc.).
6. **Mailboxes / postal specialties** — Florence clusters and numbering schemes.
7. **Visual display surfaces** — model families and mount types as attributes/modifiers.
8. **Fire protection specialties** — cabinet + extinguisher combos vs single rows.
9. **Flagpoles / specialty outdoor** — often missing or lumped “misc.”
10. **Accessory “family shorthand”** (Bobrick / Bradley / ASI prefixes) — needs **manufacturer-aware alias columns** + optional quote-block context (see `parser-support-gap-notes.md`).

---

## Top 10 safe fixes (automatable, reversible)

1. Trim whitespace on `sku`, `manufacturer`, `category`, `uom`.
2. Uppercase/normalize **`uom`** to approved enumerator where unambiguous (`scripts/catalog-audit.ts` ALLOWED_UOM pattern).
3. Backfill **`canonical_sku`** from `sku` where null (migration already partially does this).
4. Populate **`sku_normalized`** / **`manufacturer_normalized`** from sheet sync or one-off SQL (already designed in migrations).
5. **`GenericItemName` / `family`** fill from first segment of description where missing (guarded rules in Phase 3).
6. **`install_labor_family`** from **category + subcategory** mapping table (seed CSV, not inline guess in app).
7. Repair **obvious image URL** typos (`http://` double, spaces) without changing host semantics.
8. Mark **`deprecated=1`** on duplicate rows when `duplicate_group_key` or manual review ties a winner (never delete).
9. Insert **`estimator_catalog_validation_issues`** rows from audit script output (batch id + dry-run).
10. Expand **`catalog_item_aliases`** for top vendor SKUs found in `duplicate_candidates` (alias to canonical, deactivate duplicate row).

---

## Top 10 items requiring human review

1. Near-duplicate rows with **different labor minutes** for same manufacturer + model family.
2. Collapsing **mount/material** variants — estimator-significant vs catalog noise.
3. **Alias collisions** — pick canonical target; document in `estimator_notes`.
4. Converting **single row → bundle** (e.g. ADA restroom kit) without double-counting scope.
5. **Sheet row deactivation** — rows missing from sheet vs true obsolescence.
6. **Percent vs flat modifier** mismatches surfaced by audit.
7. **Cross-brand “same function” aliases** — liability vs competitive bidding value.
8. **Partition/compartment counting** — UOM semantics (EA vs COMPARTMENT vs LF).
9. **Quote-language sets** (“6 sets of …”) — model as bundle vs intake multiplier rule.
10. **Brain vs estimator catalog** reconciliation if both datasets are in play long term.

---

## Recommended implementation sequence

1. **Freeze schema truth:** confirm which migrations are deployed; archive a `pg_dump --schema-only`.
2. **Run reports:** `catalog:audit:supabase-phase` + `catalog:audit` against prod mirror.
3. **Ingest issues:** optional pipeline writing `estimator_catalog_validation_issues` with `severity` + `status`.
4. **Category + labor family lookup tables** — data-driven fills before touching row merges.
5. **Alias consolidation playbook** — `catalog_item_aliases` vs `estimator_sku_aliases` responsibilities (see Phase 6).
6. **Safe automated normalization** (`cleanup_plan.md`) in small batches with logging tables.
7. **Merge/deactivate** duplicates only after review queue is empty above a severity threshold.
8. **Div 10 enrichment** per `enrichment_plan_div10.md` — fewer, higher-confidence rows.

---

## Confirmed vs inferred

| Label | Meaning |
|-------|---------|
| **Confirmed** | Observable in migrations + grep’d application paths (tables referenced in TS). |
| **Likely** | Typical estimator DB patterns; confirm with CSVs on your environment. |
| **Inferred / opportunity** | Design recommendations (Phase 5–7) pending business sign-off.
