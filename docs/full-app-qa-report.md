# Full App QA Report — Div 10 Estimator

**Date:** 2026-05-19  
**Branch:** `main` @ `19a146b` (`chore(app): harden quote-driven MVP workflow`)  
**Auditor:** Automated + API probes + static code review (no interactive browser session in this run)

---

## 1. Executive Summary

| Item | Finding |
|---|---|
| **Overall status** | **Not ready** for production or confident real-project testing on the stated Sheets + GCS profile |
| **Biggest blockers** | (1) **`.env.local` does not match the target no-Supabase profile** — still `DB_DRIVER=pg`, `CATALOG_BACKEND=pg`, Supabase URLs/keys, `DATABASE_URL`/`DIRECT_URL`; `GCS_PROJECT_FILES_BUCKET` and `PROJECT_FILES_STORAGE` not set in file. (2) **GCS upload blocked** — service account lacks `storage.objects.create` on `brightenlabor518`. (3) **Google Sheets admin health fails** — most tabs report missing required headers vs app validation specs (tabs exist; headers diverge). (4) **End-to-end browser MVP flow not verified** in this audit. |
| **Biggest UX issues** | Cannot grade live UX; code review shows improved project intake/delete (uncommitted). Known deferred items in smoke checklist (install-assumptions discard confirm, duplicate-line busy state). |
| **Biggest technical risks** | Hybrid runtime (`DATA_BACKEND=sheets` + `DB_DRIVER=pg`) hides migration state; `GEMINI_API_KEY` injected into Vite client bundle; Supabase optional code + GCS wiring exist locally but are **uncommitted** on `main`. |
| **Recommended next step** | Apply target env to `.env.local`, fix GCS IAM, run `npm run seed:div10-sheets` / header alignment, commit Supabase-removal + GCS changes, then complete manual browser checklist. |

**Verdict:** The **codebase is moving toward** Sheets + GCS MVP, but **this machine’s configured environment and infrastructure permissions are not aligned** with the architecture you described. Do not treat “Supabase removed” as done until env, IAM, sheets headers, and browser smoke all pass.

---

## 2. Test Environment

| Field | Value |
|---|---|
| **Git** | `main` @ `19a146b` (+ uncommitted local changes: Supabase-optional/GCS, project UI polish) |
| **Runtime** | Local Windows, Node v22, existing dev server on port **3000** (second `npm run dev` failed: `EADDRINUSE`) |
| **Target architecture (requested)** | `DATA_BACKEND=sheets`, `CATALOG_BACKEND=sheet`, `DB_DRIVER=sqlite`, `PROJECT_FILES_STORAGE=gcs`, `GCS_PROJECT_FILES_BUCKET=brightenlabor518`, `DIV10_BRAIN_ENABLED=0`, no Supabase required |
| **Actual `.env.local` on disk** | `DATA_BACKEND=sheets` ✓; `DB_DRIVER=pg` ✗; `CATALOG_BACKEND=pg` ✗; Supabase + `DATABASE_URL` + `DIRECT_URL` **configured** ✗; `GCS_PROJECT_FILES_BUCKET` **not set** ✗; `PROJECT_FILES_STORAGE` **not set** ✗; `DIV10_BRAIN_ENABLED` **not set** ✗ |
| **Browser** | **Not tested** (no Playwright/browser session) |
| **Probe overlay** | Target env vars applied in shell for `qa-audit-probes.ts` only (`.env.local` still overrides some keys via dotenv) |

---

## 3. Automated Checks

| Check | Result | Duration | Notes |
|---|---|---:|---|
| `npm install` | **Pass** | ~4.0s | npm audit advisories present (not blocking) |
| `npx tsc --noEmit` | **Pass** | ~53.7s | Includes uncommitted TypeScript |
| `npm test` | **Pass** | ~38.5s | 345 tests, 342 pass, **3 skipped**, 0 fail |
| `npm run dev` (target env) | **Fail** | ~8.2s | Port 3000 already in use |
| `GET /healthz` (existing server) | **Pass** | ~161ms | HTTP 200 `ok` |
| `GET /api/v1/health` | **Pass** | ~407ms | `database: "pg"`, `dbOk: true` — reflects **current** env, not target sqlite |
| `scripts/qa-audit-probes.ts` (disk env) | **Partial** | ~14.4s | Sheets readable; validation **fail**; GCS **not configured** in `.env.local` |
| `scripts/qa-audit-probes.ts` (target overlay) | **Partial** | ~11.6s | GCS bucket set; upload **fail** (IAM); sheets validation **fail** |
| Unit: `sheetsFirstBoot.test.ts` | **Pass** | (in `npm test`) | Boot path OK **without** Supabase when env set in test |
| Unit: `proposalPrintModel.test.ts` | **Pass** | (in `npm test`) | No `internal_only` / `blocking_unknown` in print model |
| Unit: `quoteImportResultSummary.test.ts` | **Pass** | (in `npm test`) | Customer-facing import summary language |
| Unit: `catalogBackend.test.ts` | **Pass** | (in `npm test`) | `CATALOG_BACKEND=sheet` + `DB_DRIVER=sqlite` compatible |

---

## 4. Environment / No-Supabase Audit

### 4a. Target profile (requested)

| Item | Result | Notes |
|---|---|---|
| App boots without Supabase vars | **Code: Pass** / **This machine: Not verified** | `sheetsFirstBoot` test passes; live server still uses Supabase + pg |
| No `VITE_SUPABASE_*` required | **Code: Pass** / **Env: Fail** | Still configured in `.env.local`; `AuthContext` uses loose client (null OK) |
| No `SUPABASE_*` required for MVP | **Code: Pass** / **Env: Fail** | Still configured; used by running server |
| No `DATABASE_URL` required | **Code: Pass** / **Env: Fail** | Still set; `resolveEstimatorDbPath` fix (uncommitted) ignores it for sqlite |
| No `DIRECT_URL` required | **Code: Pass** / **Env: Fail** | Still configured |
| `DATA_BACKEND=sheets` | **Pass** | Set in `.env.local` |
| `CATALOG_BACKEND=sheet` | **Fail** | `.env.local` has `CATALOG_BACKEND=pg` |
| `DB_DRIVER=sqlite` | **Fail** | `.env.local` has `DB_DRIVER=pg` |
| `PROJECT_FILES_STORAGE=gcs` | **Fail** | Not in `.env.local` (probe overlay only) |
| `GCS_PROJECT_FILES_BUCKET` | **Fail** | Not in `.env.local`; overlay used `brightenlabor518` |
| `DIV10_BRAIN_ENABLED=0` | **Fail** | Not in `.env.local`; Brain admin secret still present on server |
| Workbook IDs (3 core) | **Pass** | All three configured |
| `DIV10_INSTALL_INTELLIGENCE_SPREADSHEET_ID` | **Fail** | Not configured |
| Google credentials | **Pass** | Service account email + private key configured (names only) |

### 4b. Running server (`integration-health`)

| Field | Value |
|---|---|
| `dbDriver` | `pg` |
| `catalogDataSource` | `sheets` |
| `catalogItemsReadTable` | `GOOGLE_SHEETS:CatalogItems` |
| `supabaseAnon` | configured |
| `supabaseServiceRole` | configured |
| `googleSheets` (health flag) | **false** — misleading vs successful Sheets API calls via email+key |
| `authRequired` | false |
| `div10BrainAdmin` | configured |

**Startup warnings (live server):** Not captured (server pre-existing). Uncommitted code adds `[catalog]` hints for pg/sqlite mismatch; not validated on running process.

---

## 5. Google Sheets Audit

**Method:** `GET /api/admin/div10-sheets/health` (~8s) and `scripts/qa-audit-probes.ts` (same validator).  
**Auth:** Admin route returned 200 without session in this run (`AUTH_REQUIRED` off).

**Summary:** All three workbooks are **readable** (no missing tabs). **Overall `ok: false`** because required header rows do not match `div10WorkbookValidationSpecs` / `estimatorWorkbookHeaders.ts`.

### Project / setup / estimate / proposal workbook

| Tab | Exists | Headers | Writable | Notes |
|---|---|---|---|---|
| Projects | Yes | **Fail** | Not tested | Missing: BidDueDate, StartDate, ScopeNotes, Tax*, OverheadPct, ProfitPct, BondPct, LaborRate, UnionMultiplier |
| ProjectModifiers | Yes | **Fail** | Not tested | Missing ModifierID, Multiplier, FlatAmount |
| EstimateLines | Yes | **Fail** | Not tested | Missing SectionID, SortOrder, UnitMaterialCost, UnitLaborCost, ExtendedTotal, Room, Active |
| ProposalSections | Yes | **Fail** | Not tested | Missing SectionID, Title, SortOrder |
| ProjectAlternates | Yes | **Fail** | Not tested | Missing CreatedAt |
| ProjectAllowances | Yes | **Pass** | Not tested | |
| ProjectClarifications | Yes | **Fail** | Not tested | Missing SortOrder |
| ProjectExclusions | Yes | **Fail** | Not tested | Missing SortOrder |
| Settings | Yes | **Pass** | Not tested | |

**Not in validator (user list):** ProjectSetup, ProposalSettings, ProposalClauses, TaxSettings, ProjectReadiness — may be legacy SQLite-only or different tab names.

### Vendor intake workbook

| Tab | Exists | Headers | Notes |
|---|---|---|---|
| SourceQuotes | Yes | **Fail** | Missing DetectedSubtotal |
| StagedQuoteRows | Yes | **Fail** | Missing StagedRowID, RowIndex, Detected* columns, ScopeBucket |
| QuoteAdjustments | Yes | **Fail** | Missing AdjustmentID |
| QuoteTerms | Yes | **Fail** | Missing TermID, Text, SortOrder |
| ParserProfiles | Yes | **Fail** | Missing ProfileID, ProfileName, VendorPattern, Active, Notes |
| VendorAliases | Yes | **Fail** | Missing alias, canonical_vendor_name, manufacturer_name, active, notes |

**Risk:** Strict health check may be ahead of seeded workbooks; **quote import not exercised** — runtime may map alternate headers. Treat as **blocked for production** until import smoke passes.

### Catalog / labor workbook

| Tab | Exists | Headers | Notes |
|---|---|---|---|
| CatalogItems | Yes | **Pass** | Catalog API returned items in ~980ms |
| CatalogAliases | Yes | **Fail** | Missing AliasID, AliasValue |
| ManufacturerAliases | Yes | **Fail** | Multiple missing |
| LaborFallbackRules | Yes | **Fail** | Missing FallbackLaborFamily, KeywordIncludes, … |
| InstallLaborFamilies | Yes | **Fail** | Missing FamilyID, FamilyKey, … |
| CategoryDefaults | Yes | **Fail** | Missing CategoryKey, DefaultLaborFamily, … |
| AddIns | Yes | **Fail** | Missing AddInID, Name, … |
| Bundles | Yes | **Fail** | Missing Name |
| BundleItems | Yes | **Fail** | Missing bundle_id, child_catalog_item_id, … |
| Modifiers | Yes | **Fail** | Missing ModifierID, Name, Active, SortOrder |

**Legacy tabs (CLEAN_ITEMS, ALIASES, …):** Not in current validator defaults — app uses `CatalogItems` tab name for reads when `DATA_BACKEND=sheets`.

**Duplicate IDs/SKUs:** Not audited (would need sheet export script).

---

## 6. GCS Audit

**Bucket:** `brightenlabor518` (target overlay only — **not** in `.env.local`)

| Action | Result | Duration | Notes |
|---|---|---:|---|
| Upload `qa-test/<timestamp>-probe.txt` | **Fail** | — | `storage.objects.create` **denied** for service account `labor-catalog@gen-lang-client-0568373820.iam.gserviceaccount.com` |
| Download | **Blocked** | — | No object created |
| Delete | **Blocked** | — | No object created |

**Code path:** Uncommitted `projectFilesRepo.ts` uses GCS when `PROJECT_FILES_STORAGE=gcs` and credentials + bucket set. **Supabase Storage** still used when `DB_DRIVER=pg` + Supabase storage env (current `.env.local` path).

**Required IAM (if blocked):** Grant on bucket `brightenlabor518` — e.g. **Storage Object Admin** or custom role with `storage.objects.create`, `get`, `delete`.

**Public bucket:** Not tested (assume private; verify in GCP console).

---

## 7. End-to-End Workflow Results

| Step | Result | Duration | Notes |
|---|---|---:|---|
| 1. Project creation | **Not tested** | — | Browser only |
| 2. Setup tab | **Not tested** | — | Browser only |
| 3. Quote import | **Not tested** | — | Browser only; Sheets staged-row headers fail health check |
| 4. Estimate tab | **Not tested** | — | Browser only |
| 5. Line detail drawer | **Not tested** | — | Automated tests cover sanitization; UI not verified |
| 6. Install assumptions | **Not tested** | — | Automated tests cover labor pause copy |
| 7. Confirm exclude | **Not tested** | — | Browser only |
| 8. Proposal tab | **Not tested** | — | Print model tests pass |
| 9. Print/PDF | **Not tested** | — | Print CSS + model tests pass; no browser print |

**API-only signals**

| API | Result | Duration |
|---|---|---:|
| `GET /api/v1/projects` | **Pass** | ~573ms |
| `GET /api/v1/catalog/items?limit=5` | **Pass** | ~980ms, `catalogBackend: sheets` |

---

## 8. Performance Timing

| Area | Action | Time | Rating | Notes |
|---|---|---:|---|---|
| Tooling | `npm install` | 4.0s | Good | |
| Tooling | `tsc --noEmit` | 53.7s | Concern | Slow CI feedback |
| Tooling | `npm test` | 38.5s | Acceptable | |
| Server | `/healthz` | 0.16s | Good | |
| Server | `/api/v1/health` | 0.41s | Good | |
| API | Project list | 0.57s | Good | |
| API | Catalog page (5 items) | 0.98s | Good | |
| API | Sheets health | ~8.1s | Noticeable | Full workbook validation |
| GCS | Upload probe | — | **Blocked** | IAM |
| Browser | First paint / workflows | — | **Not tested** | |

---

## 9. Bugs Found

### QA-001 — Critical — Environment profile mismatch
- **Area:** Config / deployment  
- **Steps:** Inspect `.env.local` vs target Sheets+GCS profile  
- **Expected:** sqlite + sheet catalog + gcs + no Supabase  
- **Actual:** `DB_DRIVER=pg`, `CATALOG_BACKEND=pg`, Supabase + `DATABASE_URL` present; GCS vars absent  
- **Fix:** Reconcile `.env.local` per `docs/google-sheets-gcs-mvp.md`  
- **Priority:** P0  

### QA-002 — Critical — GCS permission denied
- **Area:** Storage  
- **Steps:** `PROJECT_FILES_STORAGE=gcs`, upload probe to `brightenlabor518`  
- **Expected:** Upload/read/delete succeed  
- **Actual:** `storage.objects.create` denied for service account  
- **Fix:** IAM on bucket; confirm bucket name and project  
- **Priority:** P0  

### QA-003 — High — Sheets validation fails (headers)
- **Area:** Google Sheets  
- **Steps:** `GET /api/admin/div10-sheets/health`  
- **Expected:** `ok: true` on all workbooks  
- **Actual:** Tabs exist; most tabs missing required headers per app specs  
- **Fix:** Run seed scripts / align headers; or relax validator if runtime mapping differs  
- **Priority:** P0 before trusting quote import  

### QA-004 — High — Hybrid pg + sheets runtime
- **Area:** Database  
- **Steps:** Run server with current `.env.local`  
- **Expected:** Single clear backend  
- **Actual:** `DB_DRIVER=pg` + `DATA_BACKEND=sheets` — catalog from Sheets, workspace/metadata may still hit Postgres  
- **Fix:** Complete migration to sqlite or document intentional hybrid  
- **Priority:** P1  

### QA-005 — Medium — `integration-health` under-reports Google Sheets
- **Area:** Observability  
- **Expected:** `googleSheets: true` when email+private_key work  
- **Actual:** `false` while Sheets API calls succeed  
- **Fix:** Extend `getIntegrationHealthSnapshot()` to match credential loader used by Sheets client  
- **Priority:** P2  

### QA-006 — Medium — Gemini key in client bundle
- **Area:** Security  
- **Steps:** Review `vite.config.ts` `define: process.env.GEMINI_API_KEY`  
- **Expected:** LLM keys server-only  
- **Actual:** Key can ship to browser bundle  
- **Fix:** Remove client define; server-only routes  
- **Priority:** P1 before production  

### QA-007 — Low — Div10 Brain returns 401 vs 503
- **Area:** Div10 Brain  
- **Steps:** `GET /api/v1/div10-brain/documents` without admin secret  
- **Expected:** 503 when disabled/unconfigured  
- **Actual:** 401 (admin secret configured on server)  
- **Fix:** After `DIV10_BRAIN_ENABLED=0`, expect 503 from `requireDiv10BrainAdmin`  
- **Priority:** P3  

### QA-008 — Low — Uncommitted MVP hardening on disk
- **Area:** Release  
- **Actual:** Supabase-optional, GCS project files, project UI polish not on `19a146b`  
- **Fix:** Commit and deploy as a unit  
- **Priority:** P1  

---

## 10. Incomplete Features / Gaps

| Area | Gap | Impact | Recommended fix |
|---|---|---|---|
| Env | Target no-Supabase profile not applied locally | False confidence | Update `.env.local` |
| GCS | No upload permission | Quote PDFs fail in gcs mode | IAM |
| Sheets | Header drift vs validator | Health red; import may break | Seed / migrate tabs |
| Install intelligence | Workbook ID unset | Install assumptions may use fallback only | Set `DIV10_INSTALL_INTELLIGENCE_SPREADSHEET_ID` |
| Div10 Brain | Disabled in target; still configured on server | Noise in settings | `DIV10_BRAIN_ENABLED=0`, remove secrets |
| Browser QA | No manual pass | Unknown UX/regressions | Run `docs/mvp-smoke-checklist.md` |
| Catalog legacy tabs | CLEAN_ITEMS etc. not validated | Confusion during migration | Document canonical tab names |
| SQLite durable backup | Not configured | Local db loss on redeploy | `DATABASE_GCS_BUCKET` optional |

---

## 11. UX / Polish Issues

**Source:** Code review + checklist notes — **not live-verified**.

| Screen | Issue | Impact | Recommendation |
|---|---|---|---|
| Project intake | Polish + safer delete **uncommitted** | Inconsistent with docs | Land `style(projects): polish…` commit |
| Setup readiness | “Blocking unknown” label on setup | Acceptable if customer-facing wording | Keep user-friendly label (not raw flag) |
| Install assumptions | No discard confirm (known deferred) | Minor data loss risk | Add confirm or autosave |
| CatalogAutoSync comment | Says “Postgres-only” | Confusing in sheets mode | Update comment |
| Settings / health | Supabase flags still shown | Implies dependency | Hide when not configured |
| Empty states | Not verified | Unknown | Browser pass |
| Print/PDF | Model tests strong | — | Manual print once |

---

## 12. Data Correctness Findings

| Area | Finding | Risk | Recommendation |
|---|---|---|---|
| Print totals | **Automated: Pass** — client lines only, no internal flags | Low | Re-verify in browser |
| Proposal filter | **Automated: Pass** — `proposalPrintModel.test.ts` | Low | Browser check |
| Import summary | **Automated: Pass** — no raw flags in summary | Low | Browser check |
| Live totals | **Not tested** | Medium | Full smoke with real quote |
| Tax / proposal mode | **Not tested** | Medium | Manual cases |
| Sheets ↔ estimate sync | **Not tested** | High | Depends on header alignment |

---

## 13. Security / Production Readiness

| Check | Result | Notes |
|---|---|---|
| Secrets in client bundle | **Concern** | `GEMINI_API_KEY` in Vite `define` |
| Service role in `VITE_*` | **Pass** | Not referenced in client code paths reviewed |
| Private key in logs | **Pass** | Probes redact; GCS error shows SA email only |
| Supabase required for startup | **Fail** (current env) | Still required on this machine |
| `AUTH_REQUIRED=0` | **Pass** | Local dev open API |
| GCS private objects | **Assumed** | IAM fix needed |
| Error messages | **Pass** | No secrets in probe output |

---

## 14. Production Readiness Rating (1–5)

| Dimension | Score | Rationale |
|---|---:|---|
| Workflow completeness | **2** | API partial; browser E2E not run; sheets/GCS blockers |
| Data reliability | **2** | Header validation fail; hybrid pg/sheets |
| Proposal output quality | **3** | Strong automated print tests; no visual PDF check |
| Performance | **3** | API latencies OK; sheets health slow |
| Security | **2** | Gemini in bundle; open auth locally |
| UX polish | **2** | Not browser-verified; uncommitted UI |
| Deployment readiness | **2** | Env + IAM + uncommitted code |

**Overall: ~2.3 / 5 — Not ready**

---

## 15. Prioritized Fix List

### Must fix before production
1. Apply Sheets + GCS + sqlite env; remove Supabase vars from local and Cloud Run  
2. GCS IAM for `brightenlabor518` (`storage.objects.create` + read + delete)  
3. Align workbook headers or seed tabs — until `div10-sheets/health` is green  
4. Commit and deploy Supabase-optional + GCS `projectFilesRepo` changes  
5. Complete manual MVP smoke checklist in browser  
6. Remove `GEMINI_API_KEY` from Vite client `define`  

### Should fix soon
7. Resolve hybrid `DB_DRIVER=pg` + `DATA_BACKEND=sheets`  
8. Set `DIV10_INSTALL_INTELLIGENCE_SPREADSHEET_ID`  
9. Fix `integration-health` Google Sheets detection  
10. Land project intake / delete UX commit  

### Nice to have
11. Install assumptions discard confirm  
12. Busy states on duplicate line / save proposal  
13. CatalogAutoSync naming/docs cleanup  

### Deferred intentionally
14. Div10 Brain on Google-native storage  
15. Full legacy CLEAN_* tab support in validator  

---

## 16. Recommended Next Commits

1. `chore(app): remove Supabase dependency for Sheets-first MVP` — env template, GCS repo, brain disable, tests (already on disk)  
2. `fix(storage): document and handle GCS IAM errors on upload`  
3. `chore(sheets): align workbook headers with div10 validation specs`  
4. `style(projects): polish project intake and safer delete action`  
5. `fix(security): keep Gemini API key server-side only`  

---

## Appendix A — Static Supabase dependency scan (`src/`)

| Classification | Examples |
|---|---|
| **Safe optional legacy** | `lib/supabase.ts` (loose client), `AuthContext`, `requireSession` (skips when auth off), `div10Brain/*` (503 when unset), `serviceClient.ts` (throws only when called) |
| **Problem if required for MVP** | Current `.env.local` forces pg + Supabase; `catalog-health` route requires pg |
| **Dead / low use** | `utils/supabase/*` (may be unused in main app path) |
| **Cleanup later** | Scripts, `docs/SUPABASE_CLOUD_RUN.md`, pg migrations, `CatalogAutoSync` comment |

**Verified in code (uncommitted):** `projectFilesRepo` GCS path; `resolveEstimatorDbPath` ignores `DATABASE_URL` for sqlite; `readDiv10BrainEnv` respects `DIV10_BRAIN_ENABLED=0`.

---

## Appendix B — What was not tested

- Interactive browser workflows (all of Part 5)  
- Mobile/tablet layout  
- Real Bobrick PDF upload end-to-end  
- Proposal PDF visual quality / page breaks  
- Production Cloud Run deploy  
- Concurrent users / Sheets rate limits under load  
- Public GCS bucket ACL audit in GCP console  

---

*Report generated from automated probes, API calls to `http://127.0.0.1:3000`, and repository inspection. Re-run browser checklist after env and IAM fixes.*
