# Catalog sync: CLEAN_ITEMS cutover

Practical reference for the **curated sheet → app** model after cutover.

## Source of truth

| Tab | Role |
|-----|------|
| **CLEAN_ITEMS** | Curated forward-facing catalog rows — **live sync source** for items. |
| **ITEMS** | Raw/staging/reference only — not the live item sync source. |
| **ALIASES**, **ATTRIBUTES**, **MODIFIERS**, **BUNDLES** | Unchanged; app continues to sync these tabs as before. |

## Environment

Minimum for Sheets pull (see `.env.example` for full auth options):

- `GOOGLE_SHEETS_SPREADSHEET_ID` (or legacy `GOOGLE_SHEETS_ID`)
- Service account credentials (one of the supported `GOOGLE_SERVICE_ACCOUNT*` / `GOOGLE_APPLICATION_CREDENTIALS` patterns)
- **`GOOGLE_SHEETS_TAB_ITEMS=CLEAN_ITEMS`** — item rows are read from this tab name (default in code is `CLEAN_ITEMS` if unset)

Optional overrides (defaults match workbook tab names):

- `GOOGLE_SHEETS_TAB_MODIFIERS`, `GOOGLE_SHEETS_TAB_BUNDLES`, `GOOGLE_SHEETS_TAB_ALIASES`, `GOOGLE_SHEETS_TAB_ATTRIBUTES`

## Pre-switch / ongoing audit (spreadsheet)

In the workbook **Apps Script** menu (**Catalog**):

- **Audit CLEAN_ITEMS readiness (cutover)** — writes results to **META** (headers, active counts, orphans vs ALIASES/ATTRIBUTES, etc.).
- **Fix CLEAN_ITEMS cutover blockers** — repairs missing canonical headers and reconciles orphaned alias/attribute SKUs without deleting governed data.

Run an audit after large edits to **CLEAN_ITEMS** or **ALIASES**/**ATTRIBUTES** before relying on a deploy.

## Rollback

If item sync from **CLEAN_ITEMS** causes a problem:

1. Set **`GOOGLE_SHEETS_TAB_ITEMS=ITEMS`** (or your legacy tab name).
2. Redeploy/restart the server.
3. Run **Sync catalog** from Settings (or `POST /api/v1/settings/sync-catalog`).
4. Investigate **META** audit and sheet data; restore **CLEAN_ITEMS** curation as needed.

Rollback does **not** require changing ALIASES/ATTRIBUTES/MODIFIERS/BUNDLES tabs unless those were edited incorrectly.

## App sync entrypoints

- **Settings → Sync Google Sheets** (or `api.syncV1Catalog()` → `POST /api/v1/settings/sync-catalog`)
