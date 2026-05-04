# Brighten Install

Brighten Install is a full-stack estimating platform for commercial specialty scope workflows (Division 10 first, expandable by design). The app includes a React frontend and a Node/Express backend with SQLite persistence.

This repository contains a working v1 end-to-end workflow: intake → scope review → estimate workspace → proposal, backed by a v1 API (`/api/v1/*`) and a local SQLite database for development. A recent UI formatting pass standardized design tokens (surfaces, spacing, focus rings) to keep the app cohesive as it hardens toward production readiness.

## What exists today (high level)

- **Dashboard**: project snapshot + quick actions
- **Projects**: search/filter/sort with deep links into a project workspace
- **Project workspace**: Overview, Setup, Scope Review, Estimate, Proposal
- **Intake**: upload + parsing + review + finalize into a project (with catalog-first matching and Div 10 reasoning)
- **Estimate workspace**: grid-first pricing workflow with Div 10 transparency (bid bucket / labor origin / install family) and modifier flows
- **Proposal**: editable copy + preview + print/export path
- **Catalog**: items/modifiers/bundles + Google Sheets sync + inventory status
- **Settings**: company profile + proposal defaults + catalog sync administration
- **Admin**: Div 10 Brain admin route exists (currently URL-only; see docs)

## Tech Stack

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- SQLite (better-sqlite3)

## Getting Started

Prerequisites:

- Node.js 20+
- npm

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Type-check:

```bash
npm run lint
```

## Environment Variables

Copy `.env.example` into `.env` and set required values.

Core variables:

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `GOOGLE_SHEETS_ID`
- `GOOGLE_SERVICE_ACCOUNT`
- `GEMINI_API_KEY` (optional)

Upload parsing variables:

- `UPLOAD_PDF_PROVIDER`
	Values: `fallback-text`, `google-document-ai`, `azure-document-intelligence`
- `UPLOAD_LLM_NORMALIZATION`
	Set to `false` to disable chunk-level LLM normalization and use deterministic parsing only
- `UPLOAD_LLM_MODEL`
	Reserved for future provider/model selection wiring
- `INTAKE_GEMINI_MODEL`
	Existing model override used by chunk-level normalization helpers when Gemini is enabled

## UI / formatting system

The UI uses role-based CSS variables (design tokens) and shared `ui-*` primitives to avoid one-off styling. When changing screens, prefer using existing primitives (surfaces, inputs, chips, buttons) and the spacing scale rather than introducing new ad hoc colors or spacing.

## Current API Surfaces

Legacy API remains available under `/api/*` while rebuild proceeds.

v1 API is available under `/api/v1/*`:

- `/api/v1/health`
- `/api/v1/projects`
- `/api/v1/rooms`
- `/api/v1/takeoff/lines`
- `/api/v1/takeoff/summary/:projectId`
- `/api/v1/settings`
- Intake templates:
  - `/api/v1/intake/templates/preferred-import.xlsx`

## Upload Parsing Architecture

The upload parser now routes files through a hybrid pipeline centered on deterministic extraction first and model-assisted normalization second.

Core services:

- `src/server/services/uploadRouter.ts`
	Top-level router that detects file type, selects strategy, runs validation/confidence, and adapts the result back into the existing intake review contract.
- `src/server/services/intake/excelParser.ts`
	Native Excel/CSV parser that inspects workbook sheets, detects header sections, propagates merged cells, and preserves sheet/row provenance.
- `src/server/services/intake/pdfParser.ts`
	Abstracted PDF extraction layer with a provider interface and a fallback text extractor/chunker.
- `src/server/services/intake/normalizer.ts`
	Deterministic normalization plus optional chunk-level LLM interpretation for PDF chunks.
- `src/server/services/intake/validator.ts`
	Post-normalization checks for missing quantities, modifier misclassification, room headers, duplicates, and other review warnings.
- `src/server/services/intake/confidence.ts`
	Overall/item confidence scoring that recommends auto-import, review, or manual-template fallback.

Notes:

- Excel files are parsed natively before any model use.
- PDF files are text/layout extracted first, then chunked for normalization.
- Low-confidence rows are preserved for review rather than dropped.
- TODO: wire external provider credentials for Google Document AI or Azure Document Intelligence when those services are enabled.

## Database Notes

- SQLite database file is created locally at runtime.
- Legacy and v1 tables coexist while migration work continues.
- Schema initialization is non-destructive and runs at startup.

## Google Sheets catalog sync

The app pulls **CLEAN_ITEMS** (curated), **MODIFIERS**, **BUNDLES**, **ALIASES**, and **ATTRIBUTES** tabs from a spreadsheet into SQLite. **ITEMS** is raw/staging only (not intended as the live sync source after cutover). The Settings UI and authenticated clients should use **`POST /api/v1/settings/sync-catalog`** (see `api.syncV1Catalog()`). A legacy route **`POST /api/sync/sheets`** still exists for older integrations and calls the same sync implementation.

- **Aliases**: drive canonical-first resolution (legacy SKUs, vendor SKUs, parser phrases, etc.).
- **Attributes**: governed variants (finish / mounting / coating / grip / assembly) with optional pricing/labor deltas; new takeoff lines persist snapshots for auditability and proposal truthfulness.

Cutover and rollback for the **CLEAN_ITEMS** sync source: see **`docs/CATALOG_SYNC_CUTOVER.md`**.

For debugging service-account resolution only, set **`GOOGLE_SHEETS_AUTH_DEBUG=1`** (logs metadata, not the private key).

**Credentials (pick one):**

1. `GOOGLE_SERVICE_ACCOUNT` — full service account JSON as a string (typical for Cloud Run / Secret Manager).
2. `GOOGLE_SERVICE_ACCOUNT_FILE` — path to the JSON file, e.g. `./google-service-account.json` (gitignored). Paths are resolved from **current working directory** and **project root**, so sync still works if `cwd` is not the repo root.
3. `GOOGLE_APPLICATION_CREDENTIALS` — same as (2); standard Google env name.
4. `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` — split variables (use `\n` in the key when inline).

The JSON must be a **service account** (`type`, `client_email`, `private_key`). Enable **Google Sheets API** for the GCP project, and **share the spreadsheet** with that `client_email` (Viewer is enough for read sync).

Spreadsheet: `GOOGLE_SHEETS_SPREADSHEET_ID` (or legacy `GOOGLE_SHEETS_ID`). Tab names: `GOOGLE_SHEETS_TAB_*` in `.env.example`.

## Deployment Readiness

This repo includes a Dockerfile suitable as a baseline for container deployment (for example Cloud Run) and will be refined as later phases complete.

## Documentation & current priorities

- **Execution brief**: `docs/app-audit-and-roadmap.md` (honest snapshot + ordered next work)
- **Deployment notes**: `docs/DEPLOY.md`

Current focus is stabilization and polish:

- Phase 4: UX hygiene + repo truth (docs aligned, Dashboard as control center, Settings reliability, remove prompt-based edits, improve discoverability)
- Phase 5: production direction + platform hardening (auth, storage, repo abstraction for Postgres/Supabase while keeping local SQLite dev)
- Phase 6: testing backbone (route/repo/engine/proposal fixtures)
