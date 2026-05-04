# Publish blockers — Sheets sync preflight vs reports

This checklist aligns **runtime** validation in `preflightCatalogWorkbookSync` (`src/server/services/catalogSyncWorkbookValidation.ts`, called from `syncCatalogFromGoogleSheets`) with **`npm run catalog:publish:blockers`** (`scripts/publish-blockers-report.ts`).

## Blocking (abort before DB transaction)

Sync throws with a `Catalog sync blocked (preflight validation):` message listing up to the first **24** issues:

| Check | Source / notes |
|-------|----------------|
| Duplicate canonical SKU conflict | Same `normalizeSku()` for two **winning** item rows with differing description / material / labor |
| ALIASES: one `(alias_type, alias_value)` → multiple canonical SKUs | Sheet batch |
| BUNDLES: included SKU not on ITEMS sheet and not in existing DB | Preflight uses sheet items + DB SKUs |
| ATTRIBUTES / ALIASES: `Canonical_SKU` not resolvable from ITEMS sheet or DB | Before new rows exist in DB |
| Category allow-list | **Only if** `PUBLISH_BLOCKERS_ALLOWED_CATEGORIES` is non-empty — active-style rows must match (trim, case-sensitive) one entry (**same opt-in as publish-blockers report**) |

## Warnings (non-blocking; deduped in result)

| Check | Notes |
|-------|--------|
| Invalid / non-standard UOM | After `normalizeUnit()` vs `CATALOG_ALLOWED_UOM` from `src/shared/catalogValidationConstants.ts` (shared with `catalog-audit` / publish-blockers) |
| Ambiguous boolean in `Active` column | Unrecognized token; row still uses default |
| Non-numeric material or labor cells | Row-level message |
| Suspicious labor | Aligns with `publish-blockers-report` heuristics (negative, `>720`, zero, partition + very low minutes) |
| BUNDLES: unknown modifier key | Mirrors `upsertBundles` resolution (modifiers sheet **union** DB modifier keys), **warning** tier |
| Preflight duplicates | Items rows skipped as non–last-occurrence (superseded duplicates) — surfaced in **audit** |

## What remains report-only or manual

- **DB-wide** duplicate `(manufacturer, sku)` keys, alias collisions already stored, orphan FKs — still covered by `catalog:publish:blockers` against the database, not re-run inside a single sync preflight.

## Operator controls

- **`PUBLISH_BLOCKERS_ALLOWED_CATEGORIES`**: optional; when set, **sync** enforces the same allow-list as the report for **item rows** in the workbook batch.
- **`CATALOG_ALLOWED_UOM`**: shared constant; extend in `src/shared/catalogValidationConstants.ts` if product adds approved unit codes.
