# Estimating workspace — implementation spec & acceptance criteria

**Companion:** [`estimating-workspace-overhaul-brief.md`](./estimating-workspace-overhaul-brief.md) (product intent).  
**This document:** concrete targets, **measurable** acceptance criteria, structural before/after, non-regression checklist, visual gate, and **risk flags** where UI work can break custom behavior.

**Rules of engagement**

1. No removal or simplification of pricing modes, markup sequence, Div 10 behavior, bundles, catalog sync, or proposal rules **without a written tradeoff note** (see [§8 Risk register](#8-risk-register-tradeoffs-must-be-flagged-before-code)).
2. Each phase ships **layout + interaction + workflow** changes, not card-only restyles on the same information hierarchy.
3. A phase is **done** only when its acceptance criteria are satisfied **and** the [§7 Non-regression checklist](#7-non-regression-checklist-must-stay-green) is verified for affected flows.

---

## 0. Current implementation map (baseline for “before”)

| Area | Primary files / entry points |
|------|------------------------------|
| Global chrome | `src/components/shell/AppShell.tsx`, `src/components/shell/SidebarNav.tsx`, `src/components/routing/ProtectedShell.tsx` |
| Routes | `src/router.tsx` |
| Dashboard | `src/pages/Dashboard.tsx` |
| Project list / new project | `src/pages/Projects.tsx`, `src/pages/ProjectIntake.tsx` |
| In-project workflow (tabs + heavy state) | `src/pages/ProjectWorkspace.tsx` (~2k+ LOC), `src/components/workflow/WorkflowTabs.tsx`, `src/components/workflow/ProjectHeader.tsx` |
| Workspace pages | `src/pages/project/OverviewPage.tsx`, `SetupPage.tsx`, `src/pages/project/ScopeReviewPage.tsx` |
| Estimate grid / pickers | `src/components/workspace/EstimateGrid.tsx`, `ItemPicker.tsx`, `ModifierPanel.tsx`, `BundlePickerModal.tsx`, `EstimateToolbar.tsx`, `RoomList.tsx` |
| Proposal | `src/components/workflow/ProposalPreview.tsx`, `ProposalSectionEditor.tsx`, `ProposalSettingsRail.tsx` |
| Workflow types / URL params | `src/shared/types/projectWorkflow.ts`, `src/shared/utils/projectWorkspaceSession.ts` |
| Catalog auto-sync | `src/components/CatalogAutoSync.tsx` |
| Scope exceptions metric | `src/shared/utils/scopeReviewExceptions.ts` |

**Structural “before” (summary):** One monolithic `ProjectWorkspace` owns tabs (`overview` \| `setup` \| `scope-review` \| `estimate` \| `proposal`), estimate sub-views (`quantities` \| `pricing`), drawers/modals, and much pricing state. Global sidebar lists **Projects** as a peer of Dashboard, not the four-step job story.

---

## 1. Phase 1 — Information architecture & navigation

**Shipped (baseline):** Canonical URLs are `/project/:id/<workspaceStep>` with steps `overview` \| `setup` \| `scope-review` \| `estimate` \| `proposal`. `/project/:id` redirects to `/project/:id/estimate` and migrates legacy `?tab=` via `ProjectWorkspaceIndexRedirect`. In-project **left `ProjectStepNav`** (grouped “Project” vs “Estimate workflow”) replaces the horizontal `WorkflowTabs` strip; `?view=quantities` remains for estimate quantities.

### 1.1 Implementation targets

- **Define primary vs secondary IA in code and copy**
  - **Primary (job story):** Dashboard → Scope Review → Estimate → Proposal (each must be reachable in **≤2 clicks** from inside an open project).
  - **Secondary:** Catalog, Settings, Help, Admin (Div 10 Brain admin), Projects list / archive flows.
- **Project-scoped navigation**
  - Replace or **demote** the horizontal `WorkflowTabs` strip as the *main* way to move between the four primaries; introduce a **persistent left sub-rail** (inside project) or **nested routes** under `/project/:id/...` so each primary has its own URL (recommended for acceptance testing and deep links).
  - **Concrete routing target (recommended):** add child routes under `/project/:id`, e.g. `/project/:id/dashboard` (or reuse `overview` data in a real control center), `/project/:id/scope-review`, `/project/:id/estimate`, `/project/:id/proposal`, plus explicit secondary: `/project/:id/setup` if Setup is not merged into Estimate/Dashboard.
  - Update `src/router.tsx`; refactor `ProjectWorkspace.tsx` so it becomes a **layout shell** (outlet + shared providers/header) rather than a single component switching all tabs internally—**even if** the first PR only extracts layout and leaves pages as child components.
- **Global sidebar (`SidebarNav.tsx`)**
  - Keep global items minimal: **Dashboard**, **Projects** (or “All projects”), **Catalog**, **Settings**; move **Help** to footer or overflow; link **Admin** only when applicable.
  - When `useParams().id` is present, show **project context** (name, status) and **primary step links** in the sidebar or a **second column**—avoid duplicating hierarchy in header tabs + sidebar without intentional design.
- **Intake entry**
  - Preserve `project/new` → `ProjectIntake`; after project creation, deep-link into **Scope Review** (or Dashboard if you intentionally land on control center first—pick one behavior and document it in acceptance criteria).

### 1.2 Acceptance criteria (Phase 1)

- [ ] From `/project/:id`, user always sees **where they are** in the four-step story (visible labels, not only URL).
- [ ] Each of the four primaries has a **distinct URL** OR an agreed equivalent (e.g. `?tab=` with bookmarkable params) documented in this spec; **no hidden state-only** navigation for primaries.
- [ ] **Overview** and **Setup** are either merged into primaries with a clear home, or remain accessible but visually **secondary** (not equal-weight tabs next to Scope Review).
- [ ] No regression: existing API usage (`api.*`), autosave, and project load **unchanged** in behavior (only reorganized UI).

### 1.3 Before vs after (structural)

| Before | After |
|--------|--------|
| Horizontal tabs are the main IA inside a project | **Left project sub-nav** (or nested routes) carries the four primaries |
| Dashboard and in-project steps feel disconnected | **Same vocabulary** (Dashboard / Scope Review / Estimate / Proposal) in global + project chrome |
| `ProjectWorkspace.tsx` centralizes everything | **Layout shell + routed children** (or clearly separated page components), reducing cognitive coupling |

### 1.4 Definition of Done (Phase 1)

- Router + shell changes merged; smoke test script or manual list executed (load project, switch all primaries, refresh each URL).
- **§7** checklist run for navigation + project open.

---

## 2. Phase 2 — Scope Review redesign

**Shipped (baseline):** Scope Review is **exceptions-first**: attention rows use expandable `<details>` (summary shows bucket, confidence, match line, chips; body shows rationale, notes, modifiers). **“Looks good”** lines use a **muted** panel with optional **compact table** (bucket, confidence, catalog match, qty). **View** toggle: Action items first vs Whole project (expands trusted list). Full **EstimateTable** is opt-in (“Show full editable grid”). **Div 10 Brain** is a **secondary** muted callout. Catalog match copy uses `catalog` from workspace + `scopeReviewPresentation.ts` helpers.

### 2.1 Implementation targets

- **`ScopeReviewPage.tsx`**: Rebuild layout to **exceptions-first** default (filter preset: “needs attention” / low confidence / unmatched / bucket conflicts—define exact rules in code comments + constants).
- **Row model**: Default collapsed row shows **status, confidence, bucket, one-line match summary**; expand for **reasoning / evidence / Div 10 advisory** (secondary).
- **Visual hierarchy**: Strong matches use muted styling or a **“resolved”** group/collapsed section; uncertain rows use stronger contrast, iconography, or top section “**Action required**”.
- **Density**: Reduce columns shown by default; move low-frequency fields into expansion or side drawer tied to selected row.
- **Integration**: Keep existing line data, scope bucket enums, Div 10 advisory payloads—**change presentation only** unless a data gap is found; if so, flag under [§8](#8-risk-register-tradeoffs-must-be-flagged-before-code).

### 2.2 Acceptance criteria — Scope Review (product minimum)

- [ ] **Defaults closer to exceptions-only** (e.g. landing filter hides high-confidence resolved lines until user explicitly chooses “Show all”).
- [ ] **Strong matches visually de-emphasized** (muted, collapsed, or grouped under “Looks good”).
- [ ] **Uncertain / unmatched lines clearly surfaced** (top section or pinned filter).
- [ ] At a glance, each row shows **scope bucket**, **confidence**, **application status**, and **suggested vs original** without opening details.
- [ ] **Reasoning / evidence** available on demand (expand or drawer), not default-expanded for every row.
- [ ] **Row density materially reduced** vs current baseline (capture **before screenshot** in [§9](#9-visual-completion-gate-mockups--screenshots)); fewer simultaneous controls per row in default state.

### 2.3 Before vs after (structural)

| Before | After |
|--------|--------|
| Review feels like scanning a long table | **Triaged queues** (action / review / OK) or equivalent |
| Div 10 block competes for space | Advisory is **secondary** panel or inline compact chip + detail |
| Many columns visible at once | **Progressive disclosure** |

### 2.4 Definition of Done (Phase 2)

- Scope Review AC above **all** checked.
- **§7**: scope buckets, Div 10 advisory, exception counts, navigation to Estimate with line state preserved.

---

## 3. Phase 3 — Estimate redesign

### 3.1 Implementation targets

- **`ProjectWorkspace` estimate tab** + **`EstimateGrid.tsx`** + **`EstimateToolbar.tsx`**: Restructure to **large central grid** (max usable width), **persistent footer** with running totals (material / labor / loaded / grand total as per existing summary model—**do not change formulas** in this phase unless fixing a verified bug).
- **Add Items vs Add-Ins**: Separate entry points—e.g. primary toolbar “Add line / catalog / bundle” vs distinct “Project add-ins & conditions” region or modal family; avoid one ambiguous “+” that mixes concepts.
- **Modals**: `ItemPicker`, `BundlePickerModal`, `ModifierPanel`—flows remain, but **placement and grouping** follow the split above.
- **Bundles / rooms / categories**: Improve **group headers**, **collapse**, and scanability without removing `pricingOrganizeMode`, `takeoffRoomFilter`, or bundle linkage.
- **Pricing mode (`PricingMode`)**: Same modes; improve labeling and per-row display so **install-only / material-only / combined** is obvious (tooltips, column sets, or row badges—presentation only).

### 3.2 Acceptance criteria — Estimate (product minimum)

- [ ] **Large main working grid** (grid uses majority of viewport width on desktop breakpoint used in mockups).
- [ ] **Persistent running total / footer** visible while scrolling the grid (sticky footer or split pane).
- [ ] **Add Items** and **Add-Ins / modifiers** are **visually and structurally separated** (two distinct UI regions or clearly labeled flows).
- [ ] Applying add-ins/modifiers updates totals **without full-page reload** and within **existing autosave** semantics; user sees change **immediately** in footer/summary.
- [ ] **Install / material / both** modes still work end-to-end; clearer affordances (copy + layout, not behavior removal).
- [ ] **Bundles and groups** easier to scan and **collapse** (keyboard-friendly collapse optional stretch goal).

### 3.3 Before vs after (structural)

| Before | After |
|--------|--------|
| Toolbar + grid + drawers compete | **Grid-first**; chrome supports grid |
| Add flows feel stacked | **Two families** of actions (lines vs conditions) |
| Totals require scroll hunt | **Sticky summary** always visible |

### 3.4 Definition of Done (Phase 3)

- All Estimate AC checked; **§7** pricing sequence, modes, bundles, modifiers attachment verified.

---

## 4. Phase 4 — Labor / crew recommendation presentation

### 4.1 Implementation targets

- Trace **current crew / duration / hours** source (summary fields from API + `recommendDeliveryPlan` / bid reasoning utilities); document in PR description.
- **UI module** (new component or region in Estimate / Overview): “**Labor plan**” showing **crew count**, **duration**, **productive hours/day assumption**, **major drivers** (list from existing `conditionAssumptions` / job conditions / crew rules—no fake data).
- **Guardrails copy**: When duration implies **single installer for very long calendar span**, show explicit **assumption callout** or **“split crew?”** suggestion if product logic exists; if logic does not exist, **do not invent numbers**—flag [§8](#8-risk-register-tradeoffs-must-be-flagged-before-code) and add **transparent explanation** of current formula instead.

### 4.2 Acceptance criteria — Labor / crew

- [ ] **No** presentation of “1 person for a month” style outcomes for large jobs **without** visible assumptions (hours/day, crew size inputs, or “single crew sequential” explanation).
- [ ] **Crew count**, **duration**, **labor hours**, and **key drivers** visible in one dedicated region when Estimate (or agreed tab) is open.
- [ ] Wording is **credible** to a working estimator (review with one internal domain review before marking done).

### 4.3 Before vs after (structural)

| Before | After |
|--------|--------|
| Labor buried in summary chips | Dedicated **labor plan** surface |
| Crew logic opaque | Drivers + assumptions **explicit** |

### 4.4 Definition of Done (Phase 4)

- Labor AC checked; **§7** labor math unchanged unless an explicit bugfix with approval.

---

## 5. Phase 5 — Proposal redesign

### 5.1 Implementation targets

- **`ProposalPreview.tsx`**, **`ProposalSectionEditor.tsx`**, **`ProposalSettingsRail.tsx`**: Rebuild layout for **print** (page breaks, margins, typography), **preview** mode, and **export/print** buttons wired to existing handlers (fix bugs if “dead”).
- **Grouping:** Confirm **no room-based grouping** in customer-facing output unless setting explicitly enables it (align with `ensureProposalDefaults` / project settings).
- **Overhead:** When overhead rate is **0**, **omit** overhead line from rendered proposal (presentation + data already in project—verify).
- **Branding:** Pull company block from `SettingsRecord` / project proposal fields automatically in header.
- **Editable standard language:** Settings rail + editors remain functional; improve layout only unless copy UX is broken.

### 5.2 Acceptance criteria — Proposal (product minimum)

- [ ] **Client-facing** typography and spacing (print CSS or print-specific stylesheet).
- [ ] **Not grouped by room** in output (verify with sample multi-room project).
- [ ] **Standard language** remains editable; changes reflect in preview.
- [ ] **Branding / company** info flows from settings without manual re-entry each time.
- [ ] **Overhead hidden** when set to **0**.
- [ ] **Preview, print, and export** each verified on at least one browser (Chrome) with a written test note.

### 5.3 Before vs after (structural)

| Before | After |
|--------|--------|
| Preview feels like HTML dump | **Print-first** layout (sections, hierarchy) |
| Controls scattered | Editor / preview **split** with clear mode toggle |

### 5.4 Definition of Done (Phase 5)

- Proposal AC + print/export checks done; **§7** proposal rules verified.

---

## 6. Phase 6 — Modifiers / adders cleanup & final UX polish

### 6.1 Implementation targets

- **`ModifierPanel.tsx`**, project conditions UI in workspace: **two lanes** — line-level vs project-level; consistent naming; show **$ and minutes impact** next to applied modifiers where data exists.
- **Cross-page consistency:** Spacing scale, heading levels, button placement patterns from Phases 1–5 applied here (no orphan styling).
- **Dead buttons / broken flows:** Audit `ProjectWorkspace` + proposal actions for **Submit / Preview / Print**; fix or remove with product approval.

### 6.2 Acceptance criteria — Modifiers / polish

- [ ] Line vs project modifiers **visually distinct**; user can predict **where** to add each.
- [ ] **Pricing impact** visible for representative modifiers (union, OT, travel, height, etc.—use fixtures or seed data).
- [ ] No known **dead** primary CTA in the happy path (document any intentionally disabled states).

### 6.3 Definition of Done (Phase 6)

- Modifier AC checked; full **§7** pass; accessibility spot-check (focus order, labels on icon-only buttons).

---

## 7. Non-regression checklist (must stay green)

Run after **each** phase merge (at minimum: affected areas + smoke).

### Pricing & modes

- [ ] **Pricing modes:** install-only, material-only, combined — selectable, persist, and recalc summary correctly.
- [ ] **Markup sequence:** Direct costs → overhead → profit on (direct + overhead) → bond → tax — totals match a **fixed golden project** fixture (store JSON snapshot or spreadsheet reference in repo under `docs/` or `test/fixtures/` when created).
- [ ] **Running totals** update when lines, bundles, line modifiers, and project-level add-ins/conditions change.

### Div 10 & scope

- [ ] **Scope buckets** still assignable and visible where product requires.
- [ ] **Div 10 Brain** advisory paths unchanged functionally (503 when env missing; 200 when configured).
- [ ] **Scope exception count** badge still reflects `scopeReviewExceptions` logic unless intentionally replaced (if replaced, document new metric).

### Catalog & bundles

- [ ] **Catalog sync** (auto + manual triggers) still runs; no removal of `CatalogAutoSync` behavior without approval.
- [ ] **Search_Key** / normalized search behavior unchanged (regression test: known SKU lookup).
- [ ] **Bundles:** ADA templates, bundle collapse, bundle-to-SKU linkage, modifier keys on bundle application.

### Proposal

- [ ] **No room grouping** in default proposal output.
- [ ] **Overhead at 0** omitted from output.
- [ ] **“Professional Installation”** (or configured label) still editable via settings/copy path in use today.
- [ ] **Company / user settings** appear in proposal header/footer.

### Intake & workspace persistence

- [ ] **Autosave** / fingerprint debounce behavior: no data loss switching tabs or routes.
- [ ] **Intake → project** creation flow completes; lands on agreed primary step.

### APIs

- [ ] No accidental removal of `api` methods used by workspace; network tab clean on load project.

---

## 8. Risk register (tradeoffs must be flagged before code)

| Risk area | Why redesign can break behavior | Mitigation |
|-----------|----------------------------------|------------|
| `ProjectWorkspace.tsx` split | Missed state subscription, stale `summary`, broken autosave | Extract in small PRs; keep single source of truth for project state (store or hook) |
| Route change (`?tab=` → path) | External bookmarks / emails with old links | Redirect layer mapping old query → new path |
| Scope Review filters | Hiding lines skips required legal review in some shops | Default filter + explicit “Show all” + persist user choice |
| “Smarter crew” UI | Pressure to change formulas without approval | Phase 4 is **presentation + transparency** first; formula changes need spec sign-off |
| Proposal print CSS | Accidentally hiding sections users rely on | Print-specific QA checklist; compare PDF page count to baseline |
| Modifier regrouping | Wrong modifier attached to line vs project | Integration tests on modifier attach APIs |
| Performance | Re-renders on large grids | Profile React before/after; virtualize only if needed |

---

## 9. Visual completion gate (mockups & screenshots)

**No phase marked “complete” without visuals.**

### 9.1 Before implementation (recommended)

- **Low-fi wireframes** (Figma or static PNG) for **each primary surface** at **desktop 1440px** width: Dashboard, Scope Review, Estimate, Proposal.
- One **mobile** note per surface: either “desktop-only for v1” (explicit) or responsive behavior sketched.

### 9.2 After implementation (required)

- Store under **`docs/visuals/<phase>-<page>/`** (or team’s chosen asset path in repo):
  - `before.png` (baseline from main branch)
  - `after.png` (merged work)
  - Optional: `print-proposal.pdf` for Phase 5
- **README** in that folder listing **date**, **branch**, **commit SHA**, and **browser** used.

### 9.3 Review gate

- Product/design sign-off on **after** screenshots for the four primaries **plus** labor panel and proposal print sample before closing the epic.

---

## 10. Acceptance criteria — four primary surfaces (consolidated checklist)

Use as release gate for the epic (all must be true).

### Dashboard

- [ ] Shows **project status**, **estimate/workflow status**, **current pricing snapshot** (or clear path to open project with snapshot).
- [ ] Surfaces **key warnings** (due dates, incomplete scope, sync errors if applicable).
- [ ] **Next actions** (buttons/links) to Scope Review, Estimate, Proposal as appropriate per project state.
- [ ] Reads as a **control center**, not a static list page only.

### Scope Review

- [ ] (Same as §2.2 — all bullets satisfied.)

### Estimate

- [ ] (Same as §3.2 — all bullets satisfied.)

### Proposal

- [ ] (Same as §5.2 — all bullets satisfied.)

### Labor / crew (cross-cutting)

- [ ] (Same as §4.2 — all bullets satisfied.)

---

## 11. Suggested sequencing inside each phase (for PR hygiene)

1. **Structure** (routes / layout / empty states)  
2. **Data wiring** (no visual polish) — prove no regression  
3. **Visual + interaction** — meet AC  
4. **Screenshots** + **§7** checklist + PR notes with **before vs after** paragraph

---

## 12. PR template snippet (paste into description)

```markdown
## Phase: (1–6)

## Before vs after (structural)
- Before: …
- After: …

## Acceptance criteria
- [ ] (link to section in docs/estimating-workspace-implementation-spec.md)

## Non-regression (§7)
- [ ] checklist attached / noted N/A with reason

## Risks / tradeoffs flagged (§8)
- …

## Visuals
- docs/visuals/… (before/after)
```

---

*End of implementation spec.*
