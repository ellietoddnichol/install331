# Brighten Install

Brighten Install is a full-stack estimating platform for commercial specialty scope workflows (Division 10 first, expandable by design). The app includes a React frontend and a Node/Express backend with SQLite persistence.

This repository is currently in a structured rebuild. Phase 1 establishes normalized backend persistence and connected API routes for projects, rooms, takeoff lines, and settings.

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

## Current API Surfaces

Legacy API remains available under `/api/*` while rebuild proceeds.

New rebuild API (Phase 1) is available under `/api/v1/*`:

- `/api/v1/health`
- `/api/v1/projects`
- `/api/v1/rooms`
- `/api/v1/takeoff/lines`
- `/api/v1/takeoff/summary/:projectId`
- `/api/v1/settings`

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

The app pulls **ITEMS**, **MODIFIERS**, and **BUNDLES** tabs from a spreadsheet into SQLite. The Settings UI and authenticated clients should use **`POST /api/v1/settings/sync-catalog`** (see `api.syncV1Catalog()`). A legacy route **`POST /api/sync/sheets`** still exists for older integrations and calls the same sync implementation.

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

## Rebuild Status

Completed in this pass:

- Phase 1 backend architecture scaffold
- normalized schema for projects/rooms/takeoff/settings
- modular repositories and v1 route modules
- initial estimate summary service

Next:

- connect frontend workspace to v1 API
- catalog CRUD normalization and add-from-catalog flow
- bundles/modifiers/variants in normalized schema
- parser review/finalization workflow and proposal reconciliation
