# Refactor: shift app to quote-driven estimating MVP

## Summary

This PR simplifies the app from a parser-first intake product into a quote-driven estimating and proposal workflow.

The active product path is now:

1. Create project
2. Add vendor quote or start with manual estimate lines
3. Edit staged quote lines
4. Import selected lines into estimate
5. Apply labor, pricing, and visibility
6. Generate proposal

This replaces the older setup / scope review / matching-first flow as the main path through the product.

---

## Why this change

The prior architecture had too many competing entry paths and too much emphasis on heavy intake/parsing workflows.

The product is now aligned to the real starting conditions for most jobs:

- vendor quotes
- manual custom item entry

This reduces product sprawl and makes the app more launchable without rewriting the stable estimate/proposal backbone.

---

## Product direction after this PR

The app should now be understood as a:

**quote-driven estimating + proposal tool**

It is no longer centered on:

- parser-heavy intake
- matrix takeoff-first workflows
- room-first estimating
- exception-review as the primary work surface

Catalog support remains helpful, but optional.

---

## What was kept

These core systems were intentionally preserved:

- project record backbone
- pricing engine
- labor and markup logic
- proposal generation
- optional catalog support

This keeps the most valuable business logic stable while simplifying intake and navigation.

Key retained foundations include:

- `ProjectWorkspace.tsx`
- `takeoffRepo.ts`
- `estimateEngineV1.ts`

---

## What was simplified

The following areas were simplified to support the new primary workflow:

- project creation
- workspace navigation
- project starting flow
- quote staging and import path

New work now routes through:

- `ProjectCreate.tsx`
- `projectWorkflow.ts`
- simplified project workspace tabs
- `QuotesPage.tsx` staging/import flow

---

## What was removed or bypassed

These flows are no longer part of the active primary experience:

- parser-first new-project wizard as the default `/project/new` path
- Setup as a primary workspace tab
- Scope Review as a primary workspace tab
- Matching as a primary workspace tab
- Help/Admin as primary top-level navigation surfaces

Important note:
legacy intake/parser code still exists in the repo in places, but it is no longer the default product path.

---

## New route structure

### Top-level navigation
- Dashboard
- Projects
- Catalog
- Settings

### Project entry
- `ProjectCreate.tsx`

### Project workspace
- Overview
- Quotes
- Estimate
- Proposal

Primary files:
- `ProjectWorkspace.tsx`
- `projectWorkspaceRoutes.ts`
- `projectWorkspaceSession.ts`

---

## Data model direction

### Preserved / reused
- `ProjectRecord` / `projects_v1` remain the project backbone
- `TakeoffLineRecord` / `takeoff_lines_v1` remain the estimate line backbone
- `rooms_v1` remains only as optional organization metadata
- `project_files_v1` remains the uploaded source file store

### Added
- `source_quotes_v1`
- `source_quote_lines_v1`

Supporting files:
- `schema.ts`
- `sourceQuotesRepo.ts`
- `quotesRoutes.ts`

Important decision:
estimate lines continue to reuse the existing takeoff-line backbone so pricing and proposal logic remain stable while the intake path becomes simpler.

---

## User-facing behavior after this PR

A user can now:

- create a project
- go directly into a quote-driven workspace
- add or stage quote lines
- import selected quote lines into the estimate
- manually add custom estimate lines
- apply pricing/labor/visibility logic
- generate a proposal from the estimate

This makes the app behave more like a real estimator workflow and less like an intake-analysis tool.

---

## Files changed

- `ProjectWorkspace.tsx`
- `ProjectCreate.tsx`
- `ProjectOverviewMvpPage.tsx`
- `QuotesPage.tsx`
- `router.tsx`
- `SidebarNav.tsx`
- `Dashboard.tsx`
- `projectWorkflow.ts`
- `projectWorkspaceRoutes.ts`
- `projectWorkspaceSession.ts`
- `ProjectWorkspaceIndexRedirect.tsx`
- `estimator.ts`
- `schema.ts`
- `sourceQuotesRepo.ts`
- `quotesRoutes.ts`
- `index.ts`
- `api.ts`
- `projectsRepo.ts`
- `projectsRepo.projectAutofill.test.ts`
- `sourceQuotesRepo.test.ts`

---

## Before vs After

### Before
- new project flow leaned parser-first
- workspace exposed Setup / Scope Review / Matching as primary stages
- draft projects pushed users toward intake analysis
- product identity felt split across multiple competing workflows

### After
- new project flow is quote-driven
- workspace centers on Overview / Quotes / Estimate / Proposal
- draft projects move toward Quotes and Estimate
- app identity is now coherent: quote-driven estimating and proposal generation

---

## Acceptance criteria

- [x] `/project/new` no longer defaults to the parser-first wizard
- [x] project workspace uses the simplified tab structure:
  - Overview
  - Quotes
  - Estimate
  - Proposal
- [x] users can create/stage quote lines in the Quotes surface
- [x] users can import selected staged quote lines into the estimate
- [x] estimate/proposal backbone remains functional
- [x] Help/Admin are no longer primary navigation surfaces
- [x] default room creation still works for new projects
- [x] quote import staging tests pass
- [x] TypeScript/lint validation passes

---

## Validation

Validated successfully with:

- focused tests for default room creation
- focused tests for quote import staging
- full TypeScript/lint validation

---

## Deferred follow-up work

### Phase 2
1. Lightweight quote extraction only
	- CSV row mapping
	- pasted text row splitter
	- simple heuristic column detection

2. Native Postgres/Supabase coverage for
	- `source_quotes_v1`
	- `source_quote_lines_v1`

3. Legacy cleanup pass
	- remove dead route/page wiring for old intake/setup/review/matching paths
	- remove stale utilities no longer used by the primary flow

---

## Risk notes

This PR intentionally avoids rewriting the pricing/proposal engine.
It reduces risk by reusing stable estimate/proposal foundations and changing the product entry/workflow model around them.

That means the app moves toward launch readiness without destabilizing core estimating behavior.

---

## Bottom line

This PR gives the app a clearer and more practical identity:

**a quote-driven estimating and proposal MVP**

That is a stronger launch posture than the previous parser-first architecture.
