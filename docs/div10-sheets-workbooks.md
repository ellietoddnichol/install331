# Div 10 — Google Sheets workbooks (`DATA_BACKEND=sheets`)

When `DATA_BACKEND=sheets`, the vendor-intake estimating workspace reads/writes **header-based tabs** in three Google Sheets workbooks. Spreadsheet IDs must come from **environment variables only** (see `src/server/config/div10SheetsWorkbooks.ts` and `src/server/repos/dataBackend.ts`).

## Canonical env vars

| Variable | Logical workbook | Typical tabs / role |
|----------|------------------|---------------------|
| `PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID` | **Project / estimate / proposal** | Projects, modifiers, estimate lines, proposal sections/overrides, alternates, allowances, clarifications, exclusions, terms, **Settings** |
| `VENDOR_INTAKE_BACKEND_SPREADSHEET_ID` | **Vendor intake** | Source quotes, staged quote rows, quote adjustments/terms, parser profiles, vendor parsing rules |
| `CATALOG_LABOR_BACKEND_SPREADSHEET_ID` | **Catalog / labor** | Catalog items & aliases, manufacturer aliases, labor fallback rules, install labor families, category defaults, Div10 add-ins, bundles, modifiers, settings |

Legacy aliases (`GOOGLE_PROJECTS_SPREADSHEET_ID`, `GOOGLE_SETTINGS_SPREADSHEET_ID`, `GOOGLE_CATALOG_SPREADSHEET_ID`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_ID`) are supported only where documented in code; **there is no `GOOGLE_*` alias for the vendor intake workbook** — use `VENDOR_INTAKE_BACKEND_SPREADSHEET_ID`.

## Operators

- Copy env patterns from **`.env.example`** (section “Div 10 estimator — three Google Sheets workbooks”).
- After the API is ready and you are signed in (when `AUTH_REQUIRED=1`), validate workbooks: **`GET /api/admin/div10-sheets/health`** — spreadsheet IDs in the JSON are **masked**; missing tabs/headers are listed by name.

## Related

- Div 10 Brain (RAG / embeddings): `docs/div10-brain-env.md` — separate from these workbook ids.
