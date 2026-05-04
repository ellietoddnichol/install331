# Manual review queue — operator triage (duplicates, aliases, labor, orphans)

## Surfaces

1. **Catalog → Sync publish review** — collapsible sections with counts and capped line samples (mirrors preflight `catalogReview` + warning text fallbacks). When a **Historical workbook** chip appears, sample caps and blocking limits shown are those **recorded on the last run** (`run_context_json.validation`).
2. **Settings → Recent sync runs** — **Context** column: **Historical** when `run_context_json` is present; **Legacy row** when old runs have no persisted context (tab summary then matches **current** server env).
3. **CLI exports** — `npm run catalog:publish:blockers` for CSV-style blocker reports (full lists beyond UI caps). Align category allow-list with `PUBLISH_BLOCKERS_ALLOWED_CATEGORIES` (also snapshotted in `run_context_json` for new runs).

## Workflow by finding type

| Finding | In-app | Follow-up |
|--------|--------|-----------|
| Duplicate SKU groups | Expand “Duplicate SKU hints”; note sample keys | Resolve in workbook `CLEAN_ITEMS` so canonical rows are unique; re-sync |
| Alias multi-target | “Alias conflicts” section | Fix `ALIASES` rows so one alias key maps to one canonical identity |
| Labor outliers | “Labor outliers” | Adjust minutes in sheet or document intentional high/low values |
| Bundle unknown SKU / modifier | “Orphan bundles” | Add missing item rows or fix included SKU / modifier tokens in `BUNDLES` |
| Orphan attribute / alias canonical | “Orphan attrs / aliases” | Point attribute/alias rows at SKUs present in the items tab used for that sync (see historical items tab) |

## Historical vs current server

- Compare **historical** tab names on a run (from `historicalSyncRunContext` / rendered `workbook`) against **Settings** live env (`serverConfigNow`) when debugging “this run didn’t match what I expect today.”
- Old runs without `run_context_json`: treat tab labels as **current server** only; prefer re-running sync after deploy to obtain a fresh historical snapshot.
