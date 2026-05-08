# Stabilization Plan

**Date:** 2026-05-08
**Companion:** `docs/stabilization-audit.md`
**Purpose:** Ordered, safe cleanup roadmap based on audit findings.

---

## Guiding Principles

1. **Do not break the current app** — all changes must be non-breaking
2. **Prefer small, reviewable commits** — each PR should do one thing
3. **Verify before deleting** — grep for actual usage, not assumed usage
4. **Document first, refactor second** — make the transition debt visible before removing it
5. **Keep local dev working** — SQLite must remain the default
6. **No estimate math changes** — this is stabilization, not feature work

---

## Current State (From Audit)

### ✅ What Works
- v1 API (`/api/v1/*`) handles projects, rooms, takeoff, settings, intake
- SQLite persistence (default, production-ready)
- Postgres persistence (opt-in via `DB_DRIVER=pg`, production-ready)
- Dual-mode query abstraction (`src/server/db/query.ts`)
- Auth waterfall (Supabase → server password → legacy fallback)

### ⚠️ Transition Debt
- Legacy `/api/catalog/*` routes still **required** (137+ frontend calls)
- v1 API has **no catalog CRUD** (only reads modifiers/bundles, no writes)
- Three parallel auth paths (intentional for flexibility, but confusing)
- README does not explain dual API / dual persistence / auth options
- Duplicate section in README (lines 119-144)

### ❌ Blockers to Removal
- Cannot remove legacy catalog routes until v1 catalog CRUD exists
- Cannot remove SQLite (default for local dev + tests)
- Cannot change auth (current waterfall is intentional)

---

## Phase 1: Documentation Hygiene (Do Now — This PR)

**Goal:** Make the repo easier to understand **without changing any behavior**.

### 1.1 Update README.md ✅

**File:** `/README.md`

**Changes:**
1. **Line 3:** Add mention of Postgres/Supabase option alongside SQLite
2. **Line 80-91:** Expand "Current API Surfaces" section to clarify:
   - v1 API is primary for projects/takeoff/settings/intake
   - Legacy API is required for catalog CRUD (items/modifiers/bundles)
   - v1 catalog CRUD is planned but not yet implemented
3. **Lines 119-144:** Remove duplicate "Upload Parsing Architecture" section
4. **Line 51-73:** Expand "Environment Variables" section to include:
   - `DB_DRIVER` (sqlite | pg)
   - `CATALOG_BACKEND` (auto | local | supabase)
   - `AUTH_LOGIN_PASSWORD` (optional server password session)
   - `AUTH_LOGIN_EMAIL` (optional email requirement for password session)
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (optional Supabase auth)
5. **End of README:** Add "## Architecture Documentation" section linking to:
   - `docs/app-audit-and-roadmap.md` (comprehensive roadmap)
   - `docs/stabilization-audit.md` (current transition debt)
   - `docs/CATALOG_SYNC_CUTOVER.md` (catalog sync details)

**Risk:** 🟢 Low (documentation only)

### 1.2 Add Inline Architectural Comments ✅

**Goal:** Explain confusing transition points in the code itself.

#### a) `server.ts` (API mount order)

**File:** `server.ts`
**Location:** Lines 103-104

**Add comment above mount lines:**
```typescript
/**
 * Mount order matters: v1 API is primary, legacy API is fallback.
 * Legacy /api/catalog/* routes are still required because v1 API does not yet implement
 * catalog CRUD (POST/PUT/DELETE for items/modifiers/bundles). Frontend (Catalog.tsx,
 * ProjectWorkspace.tsx) makes ~137 calls to legacy catalog endpoints.
 * See docs/stabilization-audit.md for removal roadmap.
 */
app.use('/api/v1', v1Router);
app.use('/api', legacyRouter);
```

#### b) `src/services/api.ts` (Method naming convention)

**File:** `src/services/api.ts`
**Location:** Top of `api` object (around line 53)

**Add comment:**
```typescript
/**
 * API client for both v1 and legacy endpoints.
 *
 * Naming convention:
 * - Methods prefixed with `V1` or `v1` call `/api/v1/*` (primary API)
 * - Methods without version prefix call legacy `/api/*` (retained for catalog CRUD only)
 *
 * Example:
 * - getV1Projects() → /api/v1/projects (v1 API)
 * - getCatalog() → /api/catalog/items (legacy API, still required)
 *
 * Why legacy catalog routes still exist:
 * v1 API currently has no catalog write operations (POST/PUT/DELETE for items/modifiers/bundles).
 * The frontend Catalog.tsx and ProjectWorkspace.tsx make ~137 calls to legacy catalog endpoints.
 * These will be migrated to v1 once v1 catalog CRUD routes are implemented.
 */
export const api = {
```

#### c) `src/context/AuthContext.tsx` (Three auth paths)

**File:** `src/context/AuthContext.tsx`
**Location:** Above `signIn()` function (around line 75)

**Add comment:**
```typescript
  /**
   * Multi-path authentication waterfall (ordered by preference):
   *
   * 1. Supabase Auth (if VITE_SUPABASE_URL is configured)
   *    - Production-ready, full user management
   *    - Requires Supabase project setup
   *
   * 2. Server Password Session (if AUTH_LOGIN_PASSWORD is set)
   *    - Simple password check + HTTP-only cookie
   *    - Suitable for single-user or small team deployments
   *
   * 3. Legacy Client-Only Fallback (if neither Supabase nor password is configured)
   *    - Accepts any password, stores email in localStorage
   *    - NOT production-safe, intentionally kept for local dev convenience
   *    - Controlled by absence of both Supabase and AUTH_LOGIN_PASSWORD
   *
   * The server still enforces requireSession middleware on /api/v1/* routes.
   */
  async function signIn(email: string, password: string, remember: boolean): Promise<boolean> {
```

**Risk:** 🟢 Low (comments only, no behavior change)

### 1.3 Remove Duplicate Content ✅

**File:** `/README.md`
**Location:** Lines 119-144 (duplicate "Upload Parsing Architecture" section)

**Action:** Delete lines 119-144 (exact duplicate of lines 93-118)

**Risk:** 🟢 Low (removes duplication, no content loss)

---

## Phase 2: Code Verification (Do Next — Before Any Removal)

**Goal:** Confirm what is safe to remove **before** removing it.

### 2.1 Verify Unused Legacy Tables ⚠️

**Action:** Grep for `global_bundles`, `global_addins` references

```bash
grep -r "global_bundles\|global_addins" src/ --include="*.ts" --include="*.tsx"
```

**If zero results:** Safe to drop tables behind a migration in future PR
**If any results:** Document usage, defer removal

**Risk:** 🟡 Medium (requires testing after removal)

### 2.2 Verify Legacy Type Usage ⚠️

**Action:** Check if `src/types.ts` legacy `Project` / `Scope` types are still used

```bash
grep -r "import.*types.*Project\|import.*types.*Scope" src/ --include="*.ts" --include="*.tsx"
```

**Expected:** May find some imports; need to verify if they reference legacy shape or v1 shape

**Risk:** 🟡 Medium (type migration may be needed)

### 2.3 Document Findings ✅

**Action:** Add a `VERIFICATION.md` file or section in this plan with grep results

**Risk:** 🟢 Low (documentation only)

---

## Phase 3: Low-Risk Cleanup (Do After Verification)

**Goal:** Remove only verified-unused code.

### 3.1 Drop Unused Legacy Tables (If Verified Unused)

**File:** `src/server/db/schema.ts` or `src/server/legacyInit.ts`

**Action:**
1. Add a migration comment noting the tables are dropped
2. Remove table creation SQL for `global_bundles`, `global_addins`
3. Test local dev and migrations

**Prerequisites:** Phase 2.1 verification complete, zero usages found

**Risk:** 🟡 Medium (requires testing)

### 3.2 Consolidate Legacy Type Shapes (If Verified Unused)

**File:** `src/types.ts`

**Action:**
1. If legacy `Project` / `Scope` are unused, add deprecation comment
2. Add TODO comment linking to v1 equivalents (`ProjectRecord`, etc.)
3. Do NOT remove yet (may break type imports in unexpected places)

**Prerequisites:** Phase 2.2 verification complete

**Risk:** 🟡 Medium (type changes can have subtle impacts)

---

## Phase 4: Future Work (Do Not Touch Yet)

**Goal:** Identify what should NOT be done in this stabilization pass.

### 4.1 Build v1 Catalog CRUD ❌ Do Not Do Now

**Why blocked:** This is feature work, not stabilization. Requires:
- New routes in `src/server/routes/v1/catalogRoutes.ts`
- Frontend migration from `api.getCatalog()` to `api.getV1Catalog()`
- Coordination between route implementation and frontend switchover
- Full testing of write operations (create/update/delete)

**When to do:** After stabilization pass, as dedicated feature PR

**Estimated scope:** Medium (new route file + frontend migration)

### 4.2 Remove Legacy Catalog Routes ❌ Do Not Do Now

**Why blocked:** Frontend still calls these ~137 times. Removal would break Catalog.tsx and ProjectWorkspace.tsx immediately.

**Prerequisites:**
1. v1 catalog CRUD routes must exist
2. Frontend must be migrated to v1
3. All legacy catalog calls must be removed from frontend

**When to do:** After v1 catalog CRUD is implemented and tested

**Estimated scope:** Large (requires v1 implementation first)

### 4.3 Remove SQLite Support ❌ Do Not Remove

**Why blocked:** SQLite is the default for local dev + tests. Removing it would:
- Break `npm test` (tests rely on SQLite)
- Break local dev for contributors without Docker Postgres
- Remove a valid single-user deployment option

**Decision:** **Keep SQLite as default, Postgres as opt-in**. This is by design, not debt.

**When to do:** Never (keep both modes)

### 4.4 Change Auth Behavior ❌ Do Not Change

**Why blocked:** Current three-path waterfall is intentional:
- Supabase: production-ready, full user management
- Server password: simple, single-user production
- Legacy fallback: local dev convenience

**Decision:** **Keep all three paths**. Document clearly (done in Phase 1), but do not remove.

**When to do:** Never (waterfall is intentional)

---

## Phase 5: Testing & Validation (Do After Each Phase)

### 5.1 After Documentation Changes (Phase 1)

**Run:**
```bash
npm run lint    # Ensure no TypeScript errors
npm run build   # Ensure production build works
```

**Expected:** No errors (docs-only changes)

**Risk:** 🟢 Low

### 5.2 After Code Removal (Phase 3)

**Run:**
```bash
npm run lint         # TypeScript validation
npm run build        # Production build
npm run test         # Unit tests
npm run dev          # Smoke test local dev
```

**Expected:** All pass

**Risk:** 🟡 Medium (code removal can break imports)

---

## Phase 6: PR Scope Definition

### This PR Should Include:
✅ docs/stabilization-audit.md (this audit document)
✅ docs/stabilization-plan.md (this plan document)
✅ README.md updates (accurate API/persistence/auth documentation)
✅ Inline comments (server.ts, api.ts, AuthContext.tsx)
✅ Removal of duplicate README section

### This PR Should NOT Include:
❌ Any route removals
❌ Any code removals (tables, types)
❌ Any behavior changes
❌ Any v1 catalog CRUD implementation

### Next PR After This:
**Title:** "Verify and remove unused legacy tables/types"
**Scope:**
- Phase 2 verification (grep results documented)
- Phase 3 cleanup (if verification confirms safe)
- Tests for any removals

### Future PRs (Separate Work):
**Title:** "Implement v1 catalog CRUD routes"
**Title:** "Migrate frontend to v1 catalog API"
**Title:** "Remove legacy catalog routes"

---

## Success Criteria

### For This PR (Documentation Pass):
- ✅ README accurately reflects dual API reality
- ✅ README accurately reflects dual persistence options
- ✅ README accurately reflects auth options
- ✅ Inline comments explain transition architecture
- ✅ No duplicate content in README
- ✅ All existing functionality still works
- ✅ `npm run lint` passes
- ✅ `npm run build` passes

### For Future PRs:
- ✅ Legacy catalog routes removed after v1 implemented
- ✅ Unused tables/types removed after verification
- ✅ Testing coverage expanded (per docs/app-audit-and-roadmap.md Phase 6)

---

## Risk Summary

| Phase | Risk Level | Reversible? | Blast Radius |
|-------|------------|-------------|--------------|
| Phase 1 (docs + comments) | 🟢 Low | ✅ Yes | Zero (no code changes) |
| Phase 2 (verification) | 🟢 Low | ✅ Yes | Zero (grep only) |
| Phase 3 (removal after verification) | 🟡 Medium | ✅ Yes (via git revert) | Small (isolated unused code) |
| Phase 4 (blocked future work) | 🔴 High | ⚠️ Partial | Large (DO NOT DO NOW) |

---

## Summary

This plan prioritizes **documentation and clarity** over **code removal**. The audit revealed that most "legacy" code is **intentionally retained** and **actively used**, not stale.

**Key insight:** The repo is not full of dead code — it's in a **deliberate transitional state**. The right move is to **document the transition**, not to **rush removals** that will break the app.

**Next steps:**
1. ✅ Execute Phase 1 (this PR)
2. ⏳ Execute Phase 2 (verification PR)
3. ⏳ Execute Phase 3 (safe removal PR)
4. ⏳ Build v1 catalog CRUD (future feature PR)
5. ⏳ Migrate frontend to v1 (future migration PR)
6. ⏳ Remove legacy catalog routes (future cleanup PR)

This approach ensures **safe, incremental progress** without breaking the current app.
