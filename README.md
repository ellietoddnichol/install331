# Brighten Install

Brighten Install is a full-stack estimating platform for commercial specialty scope workflows (Division 10 first, expandable by design). The app includes a React frontend and a Node/Express backend with flexible persistence (SQLite for local dev, Postgres/Supabase for production).

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
- SQLite (better-sqlite3) for local dev, PostgreSQL (Supabase) for production (configurable via `DB_DRIVER`)

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

### Core Variables

- `PORT` — Server port (default: 3000 dev, 8080 production)
- `NODE_ENV` — Environment mode (`development` | `production`)

### Database & Persistence

- `DB_DRIVER` — Database backend (`sqlite` | `pg`). Default: `sqlite` for local dev.
- `DATABASE_URL` — Postgres connection string (required when `DB_DRIVER=pg`)
- `CATALOG_BACKEND` — Catalog persistence mode (`auto` | `local` | `supabase`). Default: `auto` (follows `DB_DRIVER`).

### Authentication (Optional)

Choose one or more auth paths:

- **Supabase Auth** (recommended for production):
  - `VITE_SUPABASE_URL` — Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key
- **Server Password Session** (simple single-user auth):
  - `AUTH_LOGIN_PASSWORD` — Shared password for login
  - `AUTH_LOGIN_EMAIL` — (optional) Required email for login
  - `AUTH_SESSION_SECRET` — (optional) Session cookie secret
- **Legacy Fallback** (local dev only):
  - If neither Supabase nor password is configured, any password is accepted client-side (not production-safe)

### Google Sheets Catalog Sync

- `GOOGLE_SHEETS_SPREADSHEET_ID` (or legacy `GOOGLE_SHEETS_ID`)
- `GOOGLE_SERVICE_ACCOUNT` — Full service account JSON as string (typical for Cloud Run)
- `GOOGLE_SERVICE_ACCOUNT_FILE` — Path to JSON file (e.g. `./google-service-account.json`)
- `GOOGLE_APPLICATION_CREDENTIALS` — Same as `GOOGLE_SERVICE_ACCOUNT_FILE` (standard Google env name)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` — Split variables (use `\n` in key when inline)

See "Google Sheets catalog sync" section below for details.

### AI & Upload Parsing (Optional)

- `GEMINI_API_KEY` — Google Gemini API key (for intake normalization, proposal drafts)
- `UPLOAD_PDF_PROVIDER` — PDF extraction provider (`fallback-text` | `google-document-ai` | `azure-document-intelligence`)
- `UPLOAD_LLM_NORMALIZATION` — Set to `false` to disable chunk-level LLM normalization
- `UPLOAD_LLM_MODEL` — Reserved for future provider/model selection
- `INTAKE_GEMINI_MODEL` — Model override for chunk-level normalization when Gemini is enabled

## UI / formatting system

The UI uses role-based CSS variables (design tokens) and shared `ui-*` primitives to avoid one-off styling. When changing screens, prefer using existing primitives (surfaces, inputs, chips, buttons) and the spacing scale rather than introducing new ad hoc colors or spacing.

## Current API Surfaces

The app has two API layers currently active:

### v1 API (`/api/v1/*`) — Primary Surface

The v1 API is the **primary API** and handles:
- Projects (CRUD, peer defaults, files)
- Rooms (CRUD)
- Takeoff lines (CRUD, summary, finalize)
- Settings (CRUD, catalog sync, proposal draft)
- Modifiers (read, apply, remove)
- Bundles (read, items)
- Intake (parse, templates)
- Auth (password login/logout/session)
- Div 10 Brain (admin routes)

**Available routes:**
- `/api/v1/health`
- `/api/v1/projects`
- `/api/v1/rooms`
- `/api/v1/takeoff/lines`
- `/api/v1/takeoff/summary/:projectId`
- `/api/v1/settings`
- `/api/v1/modifiers`
- `/api/v1/bundles`
- `/api/v1/intake`
- `/api/v1/auth`
- Intake templates:
  - `/api/v1/intake/templates/preferred-import.xlsx`

### Legacy API (`/api/*`) — Catalog CRUD Only

The legacy API is **retained for catalog write operations** because v1 API does not yet implement catalog CRUD (POST/PUT/DELETE for items/modifiers/bundles). Frontend components (`Catalog.tsx`, `ProjectWorkspace.tsx`) make ~137 calls to these endpoints.

**Still-required routes:**
- `/api/catalog/items` — List, create, update, delete catalog items
- `/api/catalog/search` — Search catalog
- `/api/catalog/modifiers` — List, update, delete modifiers
- `/api/catalog/bundles` — List, update, delete bundles
- `/api/catalog/items/:id/aliases` — Manage item aliases
- `/api/catalog/items/:id/attributes` — Manage item attributes

**Migration path:** Once v1 catalog CRUD routes are implemented, the frontend will be migrated to v1, and these legacy routes will be removed. See `docs/stabilization-audit.md` for details.

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

## Database & Persistence

The app supports two persistence modes, selected at runtime via the `DB_DRIVER` environment variable:

### SQLite Mode (Default)

**When:** `DB_DRIVER=sqlite` (or not set)
**Database:** Local `estimator.db` file created at runtime
**Best for:** Local development, single-user deployments, testing

- Database file location determined by runtime environment:
  - Dev: `./data/estimator.db` (gitignored)
  - Production with volume: `/data/estimator.db`
  - Production ephemeral: auto-backup to Supabase Storage or GCS (see `DURABLE_SQLITE_*` env vars)
- Schema initialization is non-destructive and runs at startup
- All queries use `better-sqlite3` synchronous API

### Postgres Mode (Opt-In)

**When:** `DB_DRIVER=pg` + `DATABASE_URL` set
**Database:** Remote Postgres (Supabase pooler or standalone Postgres)
**Best for:** Multi-user production deployments, shared data access

- Connection pooled via `pg` library
- Queries automatically translated from SQLite syntax to Postgres
- Schema migrations run at startup (same schema as SQLite)
- Catalog backend follows `CATALOG_BACKEND` setting (auto, local, or supabase)

### Migration & Coexistence

- SQLite and Postgres share the same schema definitions (`src/server/db/schema.ts`)
- Query abstraction layer (`src/server/db/query.ts`) handles syntax differences
- Legacy tables from pre-v1 architecture coexist with v1 tables during transition
- Tests default to SQLite (no Docker Postgres required for `npm test`)

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

### Architecture Documentation

- **`docs/app-audit-and-roadmap.md`** — Comprehensive capability audit, shortfall matrix, and ordered roadmap (Phases 4-6)
- **`docs/stabilization-audit.md`** — Current migration debt mapping (API layers, persistence, auth)
- **`docs/stabilization-plan.md`** — Safe, incremental cleanup plan
- **`docs/DEPLOY.md`** — Deployment notes and Cloud Run configuration
- **`docs/CATALOG_SYNC_CUTOVER.md`** — Catalog sync source cutover and rollback procedures

### Current Focus

Current focus is stabilization and polish:

- Phase 4: UX hygiene + repo truth (docs aligned, Dashboard as control center, Settings reliability, remove prompt-based edits, improve discoverability)
- Phase 5: production direction + platform hardening (auth, storage, repo abstraction for Postgres/Supabase while keeping local SQLite dev)
- Phase 6: testing backbone (route/repo/engine/proposal fixtures)
