# App audit & roadmap (current-state aligned)

**Companion:** [`estimating-workspace-overhaul-brief.md`](./estimating-workspace-overhaul-brief.md), [`estimating-workspace-implementation-spec.md`](./estimating-workspace-implementation-spec.md).
**Purpose:** Honest, whole-app snapshot of what works today, where the weak spots are, and the ordered plan to close them — without relitigating the UI/IA overhaul already in flight.

The brief and spec cover **how the estimating workspace should look and feel**. This document covers **whether the data, engine, and integrations underneath can actually support that promise**, and the items not covered in those two docs.

> Note (repo reality): the major workspace/intake/proposal overhaul and a large formatting/token pass have already landed.
> The next work is stabilization and polish (Phase 4/5/6), not restarting the overhaul.

---

## 0. Executive snapshot

**Where the app is strong.**

- The **intake pipeline** is now the most sophisticated part of the app: section-context inheritance, bid bucket parsing, bundle expansion, installability rules, install-labor family fallback, scope buckets, match confidence tiers, training capture, optional Div 10 Brain enrichment.
- The **v1 SQLite data model** is coherent: one project shape, one takeoff-line shape, one settings shape. Incremental schema migrations via defensive `PRAGMA`/`ALTER` branches are in place.
- **Estimate engine**: pricing modes (`material_only | labor_only | labor_and_material`), the markup sequence (direct → OH → profit → bond → tax), and modifier repricing are implemented and covered by a real unit test (`estimateEngineV1.test.ts`).
- **Estimate & scope transparency** has landed: the estimate grid surfaces `sourceBidBucket`, `laborOrigin`, and install-family context, and scope review uses persisted bid-bucket context for grouping and triage.
- **Catalog item editing** includes install-labor family authoring via the item editor (dropdown from the registry).

**Where the app is weakest.**

1. **Dashboard is still not a “control center”.** It loads and lists, but does not consistently surface “what needs attention next” per project (warnings, exceptions, integration health).
2. **Settings and integrations UX is brittle.** A single request failure can leave the user without a retry path or clear “configured vs unhealthy” readout.
3. **Crude editing patterns remain.** `window.prompt` is still used in a few admin-ish places (notably Catalog modifiers/bundles, some room/phase prompts) and should be replaced with real forms.
4. **Auth is a prototype.** `AuthContext` accepts any non-empty password, stores the email in `localStorage`, never talks to the server. `@supabase/ssr` is installed but not wired.
5. **Single-file SQLite is still a ceiling for shared use.** It’s great for local dev; production requires a deliberate multi-user data plan (and file storage cannot remain base64-in-row at scale).
6. **Testing posture is too thin for “platform” expectations.** Server/unit coverage exists but is not yet a backbone: route smoke tests, repo round-trips, and proposal/fixture tests are the highest-leverage next additions.
7. **Discoverability/admin cleanup.** `/admin/div10-brain` is routed but not linked; there is likely remaining dead/legacy code that should be cleaned only after verifying it is unused.

The workspace overhaul is now “in the repo”. The work that remains is to make it feel dependable and production-leaning without undoing the formatting/token system.

---

## 1. Capability inventory

Legend: **●** solid · **◐** partial / brittle · **○** stub or unused.

### 1.1 Surfaces the user sees

| Surface | Status | Notes |
|---|---|---|
| Sign in | ● client-only | Any password accepts; storage is `localStorage`/`sessionStorage`. `@supabase/ssr` installed but not used. |
| Dashboard | ◐ | Loads projects + quick actions, but still needs “control center” value: warnings, next actions, and integration health visibility. |
| Projects list | ● | Search, filter, sort, permanent delete. |
| Intake wizard | ● | Five steps: start type → source → basics → estimate setup → review. Parse, peer defaults, catalog/bundle match, training capture, finalize. |
| Intake review panel | ● | Bid split banner, install-family banner, tier-based bulk accept, modifier and catalog editing inline, reasoning/evidence on demand. Strongest UI in the app. |
| Scope Review | ◐ | Exceptions-first queue exists. Bid-bucket sub-grouping done in intake review is **not repeated here**. |
| Project Overview | ◐ | Read-only snapshot + files. Limited control-center value today. |
| Project Setup | ● | Editable project + job conditions + scope categories + distance hints. |
| Estimate workspace | ● | Grid, toolbar, cost drivers, modifiers flows, item/bundle pickers. Bid-bucket / labor-origin / install-family transparency is visible in the grid. |
| Proposal | ◐ | Section editor + settings rail + preview + AI draft + install-review email. Export is a DOM snapshot; bid-bucket grouping and polish can be improved. |
| Catalog | ◐ | Items/modifiers/bundles CRUD + sync + inventory. **Modifier/bundle edits still use `window.prompt`** and should be upgraded to forms. Item editor supports `installLaborFamily`. |
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
| Google Sheets (catalog) | Catalog source of record | Sync consumes ITEMS/MODIFIERS/BUNDLES plus governed ALIASES/ATTRIBUTES. UI surfaces sync counts; deeper health/banner work still useful. |
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
| Tests | ◐ | Server/unit test backbone exists and is growing (intake, sync ingestion, snapshots, proposal formatting). Route/e2e coverage is still thin. |
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

Rendered in the estimate grid: key transparency exists (labor origin, selected options, base→delta→final snapshots on new lines).
Rendered in the proposal: selected/inferred options can be surfaced client-facing (truthfulness work in `proposalDocument.ts`).

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

## 4. Roadmap (ordered, current priorities)

This roadmap assumes the overhaul + formatting system already exist, and focuses on hardening without rewriting the intake pipeline or changing estimate math casually.

### Phase 4 — UX hygiene, polish, and repo truth (start here)

1. **Bring docs into alignment with current repo reality.**
   - Keep README honest about what exists today.
   - Mark completed work as complete; do not “promise” features that aren’t in the tree.
2. **Dashboard → control center.**
   - Per-project “what needs attention” warnings (exceptions, due soon, missing fields, integration health).
   - Clear next actions (Scope Review / Estimate / Proposal) based on project state.
3. **Settings reliability.**
   - Add retry/error surfaces; avoid freeze-prone loading behavior.
   - Show configured vs unhealthy integration state (Sheets, Gemini, Supabase/Div10Brain).
4. **Replace prompt-based editing patterns with real forms.**
   - Catalog modifiers/bundles first; any remaining prompt-based flows next.
5. **Admin discoverability and cleanup.**
   - Link or intentionally hide `/admin/div10-brain` based on configuration.
   - Remove stale/unused paths only after verifying they are truly unused.

### Phase 5 — Production direction and platform hardening

1. **Repo abstraction for a multi-user DB** while preserving SQLite local dev.
2. **Real auth** (server-backed sessions) replacing the prototype.
3. **File storage migration** away from base64-in-row storage.
4. **Integration health visibility in-app** (Sheets, Gemini/AI, Supabase/Div10Brain).
5. **Structured logging / diagnostics**.

### Phase 6 — Testing backbone (parallel with any phase)

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
