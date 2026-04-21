# App audit & roadmap

**Companion:** [`estimating-workspace-overhaul-brief.md`](./estimating-workspace-overhaul-brief.md), [`estimating-workspace-implementation-spec.md`](./estimating-workspace-implementation-spec.md).
**Purpose:** Honest, whole-app snapshot of what works today, where the weak spots are, and the ordered plan to close them — without relitigating the UI/IA overhaul already in flight.

The brief and spec cover **how the estimating workspace should look and feel**. This document covers **whether the data, engine, and integrations underneath can actually support that promise**, and the items not covered in those two docs.

---

## 0. Executive snapshot

**Where the app is strong.**

- The **intake pipeline** is now the most sophisticated part of the app: section-context inheritance, bid bucket parsing, bundle expansion, installability rules, install-labor family fallback, scope buckets, match confidence tiers, training capture, optional Div 10 Brain enrichment.
- The **v1 SQLite data model** is coherent: one project shape, one takeoff-line shape, one settings shape. Incremental schema migrations via defensive `PRAGMA`/`ALTER` branches are in place.
- **Estimate engine**: pricing modes (`material_only | labor_only | labor_and_material`), the markup sequence (direct → OH → profit → bond → tax), and modifier repricing are implemented and covered by a real unit test (`estimateEngineV1.test.ts`).
- **Intake review UI** is the most-refined surface in the app: bid-split banner, install-family banner, scope buckets, tier-based bulk actions, finalize into project.

**Where the app is weakest.**

1. **Intake-derived context dies at the project boundary.** `sourceBidBucket`, `laborOrigin`, `installScopeType`, `intakeScopeBucket` are **persisted on `takeoff_lines_v1`** but **never rendered in `EstimateGrid`, `ScopeReviewPage`, or the proposal**. All the work to compute bid splits and labor origin disappears from the estimator's view the moment they leave intake review.
2. **`material_with_optional_install_quote` was promised but never modeled.** `PricingMode` still has only three values. The intake brain can detect this fourth mode, but there is no place to persist or act on it.
3. **`installLaborFamily` is not authorable.** The column exists on `catalog_items`, the type has the field, the matcher uses a hard-coded in-code registry — but `Catalog.tsx` has **no UI field** to edit it, and there is no admin path to populate the column for real catalog items.
4. **The install-family fallback has a silent gap.** `buildInstallFamilyFallback` only fires when there is no catalog match. If a catalog match exists but has **zero labor minutes**, the catalog's `installLaborFamily` is not used to substitute default minutes.
5. **Auth is a prototype.** `AuthContext` accepts any non-empty password, stores the email in `localStorage`, never talks to the server. `@supabase/ssr` is installed but not wired.
6. **`estimator.db` is a single-file local SQLite.** This is fine for one estimator on one machine. It is a hard ceiling for multi-user, multi-device, or cloud deploys. Files are stored as **base64 in the DB**, which will balloon the file and make backups painful.
7. **Proposal export is a client-side DOM snapshot.** `jspdf` + `jspdf-autotable` are in `package.json` but have **zero imports** anywhere. The Print/Export path is a best-effort HTML download, not a real PDF pipeline.
8. **No route, repo, or client tests.** 20 server tests, all concentrated in intake. Zero coverage on Express routes, repos, the estimate engine edge cases, proposal math, or any UI. The `verify-lewis-clark-intake.ts` harness uses an absolute Windows path.
9. **A layer of dead code.** `src/components/project/*`, `ImportParsePanel`, `RightDetailDrawer`, `WorkflowTabs`, `ExceptionList`, `PricingRulesDrawer`, `Layout.tsx`, `src/server/sheets.ts`, and the `global_bundles` / `global_addins` tables are all unimported or operationally inert. `/admin/div10-brain` is routed but not linked from the sidebar.

The workspace overhaul described in the brief/spec cannot land credibly until items 1–4 are closed. The rest are important but sequenceable.

---

## 1. Capability inventory

Legend: **●** solid · **◐** partial / brittle · **○** stub or unused.

### 1.1 Surfaces the user sees

| Surface | Status | Notes |
|---|---|---|
| Sign in | ● client-only | Any password accepts; storage is `localStorage`/`sessionStorage`. `@supabase/ssr` installed but not used. |
| Dashboard | ◐ | Loads projects, renders lists and quick actions. Load failures are `console.error` only; no retry/empty state. |
| Projects list | ● | Search, filter, sort, permanent delete. |
| Intake wizard | ● | Five steps: start type → source → basics → estimate setup → review. Parse, peer defaults, catalog/bundle match, training capture, finalize. |
| Intake review panel | ● | Bid split banner, install-family banner, tier-based bulk accept, modifier and catalog editing inline, reasoning/evidence on demand. Strongest UI in the app. |
| Scope Review | ◐ | Exceptions-first queue exists. Bid-bucket sub-grouping done in intake review is **not repeated here**. |
| Project Overview | ◐ | Read-only snapshot + files. Limited control-center value today. |
| Project Setup | ● | Editable project + job conditions + scope categories + distance hints. |
| Estimate workspace | ◐ | Grid, toolbar, room list, cost drivers banner, footer stats, modifiers modal, item/bundle pickers are all wired. **No bid-bucket column, no `laborOrigin` column, no install-family chip, no labor plan region.** |
| Proposal | ◐ | Section editor + settings rail + preview + AI draft + install-review email. Export is a DOM snapshot. **No bid-split grouping.** |
| Catalog | ◐ | Items/modifiers/bundles CRUD + sync + inventory. **Modifier edits use `window.prompt`. `installLaborFamily` is not editable.** |
| Settings | ◐ | Company + labor + proposal text + sync admin. Initial load has no `.catch`; a single failure can freeze the page. |
| Div 10 Brain admin | ◐ | Routed at `/admin/div10-brain`. Not linked from the sidebar — discoverable only by URL. |
| Help | ● | Static. |

### 1.2 Engine and data

| Area | Status | Notes |
|---|---|---|
| `estimateEngineV1.ts` | ● | Summary math, pricing mode branches, labor companion totals, tested. |
| Markup sequence | ● | Direct → OH → profit(direct+OH) → bond → tax implemented in repo + engine. |
| Modifiers engine | ● | Repricing on line/modifier/bundle changes. |
| Bundles | ● | Apply + expand + linkage. |
| Scope buckets | ● | Enum defined, persisted on takeoff, surfaced in intake review. |
| Intake → takeoff persistence | ◐ | All new fields (`sourceBidBucket`, `laborOrigin`, `generatedLaborMinutes`, etc.) are persisted, but `installFamilyKey` is **lost**; only the minutes survive. |
| Intake pricing modes | ◐ | Three modes only. `material_with_optional_install_quote` missing despite intake detection needing it. |
| `installLaborFamily` | ◐ | Registry + catalog column + matcher logic all exist. No authoring UI; fallback has the zero-labor gap (§0 item 4). |
| Labor / crew plan | ○ | `recommendDeliveryPlan` exists as a helper but is not surfaced in the estimate workspace. No crew-size region. |
| `calculateEstimateSummary` | ● | Covered by tests. |

### 1.3 Integrations

| Integration | Required for | Behavior when missing |
|---|---|---|
| SQLite (`better-sqlite3`) | Everything | N/A — single local file. |
| Google Sheets (catalog) | Catalog source of record | Startup auto-sync catches and warns; UI `CatalogAutoSync` `console.warn`s silently. **No user-facing health banner.** |
| Gemini | Intake extract, proposal draft, install-review email | Throws with a specific message; no in-app health surface. Install-review has a fallback path; proposal draft does not. |
| Google Document AI | Optional PDF provider | Falls back to `pdf-parse`. |
| Google Maps Grounding Lite | Optional address enrichment | Returns `null`; warnings only. |
| Nominatim / Census | Address suggest, distance | Returns empty / `null`; route 502 on throw. |
| Supabase | Div 10 Brain only | `/div10-brain` returns 503; intake training capture returns 503. |
| OpenAI | Div 10 Brain only | Same 503 behavior. |
| Div 10 Brain admin secret | Div 10 Brain routes | 503 if unset, 401 if wrong. |

### 1.4 Operational

| Area | Status | Notes |
|---|---|---|
| Background jobs | ○ | Only a 2.5s `setTimeout` catalog sync on boot. No queue, no cron. |
| Migrations | ◐ | `PRAGMA table_info` + `ALTER TABLE` branches. Works, but no migration log or dry-run. |
| Backups | ○ | None documented. `estimator.db` + base64 files in-row. |
| Telemetry | ○ | `console.*` only. No Sentry, no structured log sink. |
| Env health view | ○ | `scripts/intake-env-smoke.ts` exists; nothing surfaces it in the app. |
| Tests | ◐ | 20 server tests, all intake-heavy. Zero route/repo/client/e2e coverage. |
| Dead code | ◐ | See §3.5. |

---

## 2. Shortfall matrix

Grouped by blast radius. Each item has a concrete closing move; the roadmap in §4 orders them.

### 2.1 Data-integrity tier (the bid-bucket and install-family promises)

| Shortfall | Evidence | Closing move |
|---|---|---|
| `sourceBidBucket` not surfaced in `EstimateGrid`, `ScopeReviewPage`, or proposal | `grep sourceBidBucket src/**` returns only intake + persistence files | Add a bid-bucket column or group header to the estimate grid; sub-group scope review rows like intake review does; grouping/label in proposal. |
| `laborOrigin` / `generatedLaborMinutes` not shown in the estimate grid | `grep laborOrigin src/components/workspace/**` — no matches | Row-level chip or trailing indicator on the grid; detail panel shows install family key + basis + minutes. |
| `installLaborFamily` cannot be edited in the catalog UI | `Catalog.tsx` has no field for it | Add a dropdown to the item editor populated from the `installLaborFamilies` registry. |
| Install-family fallback does **not** trigger when a catalog match has zero labor | `buildInstallFamilyFallback` early-returns when `catalogItemId` is set | Relax the guard: fall back if catalog labor minutes are 0 **and** the line is installable, using `item.installLaborFamily` when present. |
| `material_with_optional_install_quote` is promised but not modeled | No occurrences in `src/**` | Add the fourth `PricingMode` value; wire through intake setup, engine branches, and proposal copy. |
| Install family **key** is not persisted on the takeoff line (only minutes + `laborOrigin='install_family'` survive) | `takeoffRepo.ts` has no `install_labor_family_key` column | Add column; repo write; type field; render it in the grid detail. |
| Legacy `Project` / `Scope` types in `src/types.ts` still live alongside v1 `ProjectRecord` / `TakeoffLineRecord` | Both are imported in different parts of the tree | Decide on one shape (v1) and delete or ship a migration shim for the other. |

### 2.2 Estimator-trust tier (the thing the user keeps calling out)

| Shortfall | Closing move |
|---|---|
| No **Labor Plan** region in the estimate workspace (crew, duration, hours, drivers) — Phase 4 of the brief | Build a dedicated module reading `recommendDeliveryPlan` + job conditions; place it adjacent to the grid or as a panel in the right rail. Presentation-only first; formula changes require sign-off per `estimating-workspace-implementation-spec.md §8`. |
| Modifier panel is a modal, not a lane | Convert to a right-rail panel or drawer that stays open while editing the grid. Show $ + minutes impact inline. |
| No per-line "why this labor" inspector | Add a trailing info affordance on each row that opens an inspector: catalog labor vs generated minutes, install family, modifier contributions, rate applied. |
| Proposal has no bid-bucket sections | Add base/alternate sections with their own subtotals; respect the user's inclusion toggles from intake. |
| Proposal has no labor-origin transparency | Add a "install pricing estimated by app" footnote marker on lines with `laborOrigin='install_family'`, suppressible per-project. |
| Crew suggestions may present "1 person for a month" | Guardrail logic + UI copy: surface hours/day assumption and recommend split crew when calendar span exceeds threshold (or explicitly flag as "single-crew sequential"). |

### 2.3 Output tier (proposal polish)

| Shortfall | Closing move |
|---|---|
| Proposal export is a DOM → HTML snapshot | Build a server-side PDF path using `jspdf` + `jspdf-autotable` (already installed). Keep HTML as fallback. |
| Print CSS not validated page-by-page | Dedicated print stylesheet; at least one Chrome print-to-PDF smoke check per PR touching proposal. |
| Schedule sections are category-only, not bid-bucket-aware | See §2.1, proposal row. |
| Install-review email draft depends on Gemini without an on-device fallback | Server returns a template-filled draft when no key is set; log the downgrade. |

### 2.4 UX hygiene tier (items in the brief not yet landed)

| Shortfall | Closing move |
|---|---|
| Dashboard is not a real control center | Replace list-only dashboard with a per-project status summary: phase, scope exceptions, current total, warnings, next action. |
| Scope review does not sub-group by bid bucket | Mirror intake's bid-split UI here for consistency. |
| Catalog modifier edits use `window.prompt` | Inline editor or modal form; validation + cancel. |
| Settings and Dashboard have no retry/error states | Standardize `{ isLoading, error, retry }` pattern; central `ErrorBoundary` already exists for fallbacks. |
| `/admin/div10-brain` is unlinked | Surface conditionally in sidebar when `Authorization` / admin secret is configured, or move to Settings → Admin. |
| Orphan components and tables (see §3.5) | Delete or re-wire in a single house-cleaning PR. |

### 2.5 Platform tier (only real if the app needs to leave one laptop)

| Shortfall | Closing move |
|---|---|
| Prototype auth | Wire real auth via `@supabase/ssr` (already a dependency) or an `HTTP-Only` session cookie + bcrypt-verified password. |
| SQLite single-file + base64 files | Decide: stay single-user or move core data to Supabase Postgres + object storage. If staying: ship a backup script + retention policy. |
| No migration runner | Introduce a named migration table (even a trivial one); keep the `PRAGMA` fallback for dev resilience. |
| No server telemetry | Sentry server DSN + request ID middleware; keep logs structured. |
| Env var surface large and silent | Add a small **Integration health** page under Settings showing which integrations are configured and when they last succeeded. |

---

## 3. Details worth having when sequencing

### 3.1 The intake-to-estimate contract (honest)

Intake computes: `sourceManufacturer`, `sourceBidBucket`, `sourceSectionHeader`, `isInstallableScope`, `installScopeType`, `installFamilyFallback`, `pricingPreview`, `laborFromInstallFamily`, `materialOrigin`, `laborOrigin`, `intakeScopeBucket`, `intakeMatchConfidence`.

Persisted to `takeoff_lines_v1`: everything above **except `installFamilyFallback.key`**.

Rendered in the estimate grid: **almost none of it**.
Rendered in the proposal: **none of it**.

This is the single largest regression the workspace overhaul has to close before it can claim to be "intentional, end-to-end."

### 3.2 Pricing modes reality check

- `estimator.ts`: `material_only | labor_only | labor_and_material`.
- Intake can classify `material_with_optional_install_quote` conceptually, but there is nowhere to store it.
- Legacy `types.ts` has a `material_and_labor` alias (normalized in `engine.ts`). Do **not** add a second alias — prefer promoting the v1 enum and deprecating the legacy one.

### 3.3 Where proposal math lives

- `proposalDocument.ts`: schedule sections (category-based), investment rows, client-facing pricing rows, `formatClientProposalItemDisplay`.
- `ProposalPreview.tsx`: consumes the above, renders the DOM that is later serialized for download.
- No server-side render; `jspdf`/`jspdf-autotable` in `package.json` are dead imports.

### 3.4 Proposal export is not a real PDF

`exportProposal` and `printProposalDocument` in `ProjectWorkspace.tsx` (~896–968) serialize the live preview DOM. Fine for a print dialog, not robust for emailable client deliverables.

### 3.5 Dead / orphan inventory

| Item | Disposition |
|---|---|
| `src/components/project/{TakeoffTable, TakeoffAIParser, ProposalView, ProjectSetup, BundleManager}.tsx` | Delete; superseded by v1 workspace + intake. |
| `src/components/workspace/{ImportParsePanel, RightDetailDrawer, BundleSelector}.tsx` | Delete or re-wire into the right-rail refactor. |
| `src/components/workflow/{WorkflowTabs, ExceptionList, PricingRulesDrawer}.tsx` | Delete — not imported. |
| `src/components/Layout.tsx` | Delete — deprecated alias, zero imports. |
| `src/server/sheets.ts`, `global_bundles`, `global_addins` tables | Delete the legacy sync; drop the tables behind a safe migration. |
| Legacy `api.*` methods (`getProjects`, `createProject`, `calculateEstimate`, `getSettings`, …) | Delete from `services/api.ts`; legacy `/api/...` routes stay **only** if an external client still calls them (confirm). |
| `/admin/div10-brain` unlinked route | Link conditionally, or hide behind an env flag. |

### 3.6 Test-coverage posture

| Layer | Coverage today |
|---|---|
| Intake services (`src/server/services/intake/**`) | High — ~14 files with tests. |
| Estimate engine | One file (`estimateEngineV1.test.ts`). |
| Bid-reasoning / other services | A handful of targeted tests. |
| Express routes | None. |
| Repos | None. |
| UI components | None. |
| e2e flow | None. The `verify-lewis-clark-intake.ts` script is the closest thing — and it hard-codes a path under `c:\Users\ellie\Downloads\`. |

---

## 4. Roadmap (ordered)

This plan **dovetails with** the existing phase numbering in `estimating-workspace-implementation-spec.md`. It does not restart the overhaul; it fills the gaps that make the overhaul credible.

### Phase 0 — Data-integrity foundation (must precede all UI work)

Small, testable, no visual regression.

1. **Carry `installLaborFamily` through persistence.**
   - Add `install_labor_family` column to `takeoff_lines_v1`; write it from finalize + create-line paths; type it on `TakeoffLineRecord`.
2. **Close the zero-labor fallback gap.**
   - `buildInstallFamilyFallback` (or its caller) should fall back when catalog match exists but labor minutes are 0 and line is installable; prefer the catalog item's `installLaborFamily` before the in-code registry.
3. **Add `material_with_optional_install_quote` pricing mode.**
   - Extend the v1 `PricingMode` enum; update `ProjectIntake.tsx` setup step; update `calculateEstimateSummary` branches; copy through proposal.
4. **Authoring UI for `installLaborFamily` on catalog items.**
   - Dropdown in `Catalog.tsx` item editor from the registry; persist via existing update endpoint.
5. **Kill the legacy duplicate project type.**
   - Decide v1 is canonical; migrate any residual consumers of `src/types.ts` `Project` / `Scope` to `ProjectRecord` / `TakeoffLineRecord`; remove the shape or keep only shared leaf types.

**Acceptance.** Re-run `scripts/verify-lewis-clark-intake.ts` and assert (a) install family key round-trips to the DB, (b) a catalog match with zero labor produces install-family minutes, (c) the fourth pricing mode is selectable and persists.

### Phase 1 — Estimate workspace parity with intake (the "data survives finalize" phase)

Depends on Phase 0.

1. Add bid-bucket **column or group header** to `EstimateGrid`. Mirror intake's bid-split banner as a compact strip in the estimate toolbar; allow the user to toggle bucket inclusion from the workspace, not just intake.
2. Add `laborOrigin` + install-family **row chips** with tooltip ("Generated from default labor family: `partition_hdpe_compartment`, 12 min per compartment").
3. Inline modifier lane in place of the modifier modal (or persistent right-rail drawer); show `$` and `minutes` impact per applied modifier.
4. Row-level "why this labor" inspector: catalog labor vs generated minutes, install family, modifier contributions, rate applied.
5. Scope review page: sub-group by `sourceBidBucket` for parity with intake review.

**Acceptance.** A user finalizing Lewis & Clark sees the same bid-split split inside the estimate workspace and proposal preview as they did in intake review, with no manual steps.

### Phase 2 — Labor / crew credibility (Phase 4 of the brief)

Purely presentation-first.

1. New **Labor Plan** surface (sidebar panel or top-of-grid region) showing crew count, duration, hours/day, major drivers, condition assumptions.
2. Guardrail copy when duration implies a single installer for implausible calendar span; suggest split crew when logic supports it; otherwise label "single-crew sequential" explicitly.
3. No formula changes without explicit sign-off per the brief's §8.

### Phase 3 — Proposal polish (Phase 5 of the brief, expanded)

**Scope decision (2026-04-16):** server-side PDF is **deferred**. Existing HTML export / browser-print path stays. `jspdf` / `jspdf-autotable` remain in deps but will be wired after the Supabase migration so the PDF endpoint runs in the same deploy target.

1. Proposal bid-bucket sections — base and alternates as visibly distinct areas with their own subtotals.
2. Labor-origin transparency footnote per project (toggleable in proposal settings).
3. Print CSS pass: margins, page breaks, typography, company block, overhead-at-zero hiding.
4. **Deferred:** server-side PDF route. Revisit after Phase 5.

### Phase 4 — UX hygiene and dead-code cleanup

1. Dashboard as a real control center (project state, warnings, next action, current total).
2. Inline modifier catalog editor (replace `window.prompt`).
3. Standardize `{ isLoading, error, retry }` UI pattern on Dashboard + Settings.
4. Link or hide `/admin/div10-brain` based on admin secret presence.
5. Delete the orphan list in §3.5 in a single PR behind a red/green CI run.

### Phase 5 — Supabase migration and operational hardening

**Direction decision (2026-04-16):** the app is moving to **Supabase** as the primary data platform. SQLite stays as the local-dev fallback only. Core tables (`projects_v1`, `rooms_v1`, `takeoff_lines_v1`, `settings_v1`, `modifiers_v1`, `bundles_v1`, `bundle_items_v1`, `line_modifiers_v1`, `catalog_sync_status_v1`, `catalog_sync_runs_v1`, `project_files_v1`, `intake_catalog_memory_v1`, `catalog_items`) move to Postgres.

Sequencing inside the phase:

1. **Repo abstraction.** Introduce a thin driver boundary in `src/server/repos/**` (SQLite now, Postgres later) so route code is unchanged. Keep the existing `better-sqlite3` driver as the default for local dev.
2. **Schema in Supabase.** Port `schema.ts` to a Postgres migration (one file, idempotent). Move file storage to **Supabase Storage** instead of base64-in-row for `project_files_v1`.
3. **Auth via `@supabase/ssr`.** Replace the prototype `AuthContext`; add server-side session verification middleware; expose `req.user` to route handlers. Projects become tenant-scoped by `owner_id` or `org_id`.
4. **Cutover plan.** Dual-write period is optional; simpler to take a single downtime window, snapshot SQLite, import into Supabase, flip an env var.
5. **Integration health** page under Settings reading the env-readiness checks as `scripts/intake-env-smoke.ts` plus last catalog-sync timestamps and last Supabase heartbeat.
6. **Migration runner.** A named `schema_migrations` table, managed by a single migration command (`npm run db:migrate`) against Postgres. SQLite keeps its defensive `PRAGMA` branches as belt-and-braces for local dev.
7. **Sentry** (or equivalent) server DSN + per-request ID middleware.

Non-goals for this phase: multi-region, read replicas, row-level security hardening beyond basic tenant isolation. Those come after the cutover is stable.

### Phase 6 — Testing backbone (parallelizable with any of the above)

1. **Route smoke tests** for every `/api/v1/*` endpoint (happy path + 400/404 + auth). Use the existing `tsx --test` harness.
2. **Repo tests** covering the migration branches and the field round-trip on `takeoff_lines_v1`.
3. **Estimate engine property tests** for each pricing mode + markup sequence.
4. **Proposal snapshot tests** on `proposalDocument.ts` for a seeded fixture project.
5. **Convert `verify-lewis-clark-intake.ts`** to a portable fixture under `test/fixtures/` so it runs in CI.
6. Optional: one Playwright smoke for the happy path (`login → intake → finalize → estimate → proposal`).

---

## 5. Sequencing and acceptance gates

Dependency graph:

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
   │                                    │
   └──────► Phase 6 (tests) ◄────── every phase adds coverage
Phase 4 and Phase 5 are parallel to the above and can land in small PRs.
```

**Gate for each PR.** Follow the PR template in `estimating-workspace-implementation-spec.md §12` and run the non-regression checklist in §7 of that doc. The items in this roadmap that change persisted fields **must** add a repo or route test in the same PR.

---

## 6. Explicit non-goals for this roadmap

- No change to the markup sequence (direct → OH → profit → bond → tax).
- No collapse of pricing modes.
- No removal of Div 10 Brain advisory path.
- No rebuild of the intake pipeline that is already working.
- No silent migration off SQLite — Phase 5 is a deliberate, scoped cutover to Supabase.
- No formula changes to crew sizing without approval (brief §8).

---

## 7. One-line summary

**Finish the intake contract end-to-end, make labor/pricing transparency visible in the estimate and the proposal, then polish.** Everything else is housekeeping.
