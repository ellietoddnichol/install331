# Stabilization Audit

**Date:** 2026-05-08
**Purpose:** Map current migration debt (API layers, persistence paths, auth paths, stale docs) to enable safe, incremental cleanup.

---

## Executive Summary

The repo contains **multiple transitional layers** that reflect an in-progress migration from legacy patterns to a v1 architecture. The migration is **incomplete** but **partially successful**:

- ✅ **v1 API (`/api/v1/*`)** is fully functional and handles most project/takeoff/intake/settings operations
- ⚠️ **Legacy API (`/api/*`)** is still **actively used** for all catalog CRUD operations (items, modifiers, bundles, aliases, attributes)
- ✅ **SQLite** is fully working for local dev
- ⚠️ **Postgres/Supabase** support exists but is **opt-in** via `DB_DRIVER=pg` environment variable
- ⚠️ **Auth** has **three parallel paths**: Supabase auth, server password session, and legacy client-only fallback
- ❌ **Documentation** is partially stale and does not fully reflect the current dual-API reality

**Key finding:** The frontend `Catalog.tsx` and `ProjectWorkspace.tsx` make ~137 calls to legacy `/api/catalog/*` endpoints. These cannot be removed until equivalent v1 routes are created and the frontend is migrated.

---

## 1. API Layer Inventory

### 1.1 Legacy API (`/api/*`) — Currently Mounted, Actively Used

**Location:** `src/server/routes/legacyRouter.ts`
**Mounted at:** `/api` in `server.ts:104`
**Status:** ⚠️ **In active use** — Cannot be removed yet

#### Routes Still Defined

| Route | Method | Purpose | Active Callers |
|-------|--------|---------|----------------|
| `/api/health` | GET | Health check | Unknown |
| `/api/catalog/items` | GET | List catalog items | ✅ `Catalog.tsx`, `ProjectWorkspace.tsx` |
| `/api/catalog/search` | GET | Search catalog | ✅ Multiple components |
| `/api/catalog/items` | POST | Create catalog item | ✅ `Catalog.tsx:1120`, `ProjectWorkspace.tsx` |
| `/api/catalog/items/:id` | PUT | Update catalog item | ✅ `Catalog.tsx:1122`, `ProjectWorkspace.tsx` |
| `/api/catalog/items/:id` | DELETE | Soft-delete catalog item | ✅ `Catalog.tsx:1284` |
| `/api/catalog/items/:id/aliases` | GET | List aliases | ✅ `Catalog.tsx:1135` |
| `/api/catalog/items/:id/aliases` | POST | Create alias | ✅ `Catalog.tsx:1213` |
| `/api/catalog/item-aliases/:aliasId` | DELETE | Delete alias | ✅ `Catalog.tsx:1225` |
| `/api/catalog/items/:id/attributes` | GET | List attributes | ✅ `Catalog.tsx:1148` |
| `/api/catalog/items/:id/attributes` | POST | Create attribute | ✅ `Catalog.tsx:1177` |
| `/api/catalog/item-attributes/:attributeId` | DELETE | Delete attribute | ✅ `Catalog.tsx:1201` |
| `/api/catalog/modifiers` | GET | List modifiers | ✅ `Catalog.tsx` |
| `/api/catalog/modifiers/:id` | PUT | Update modifier | ✅ `Catalog.tsx:1300` |
| `/api/catalog/modifiers/:id` | DELETE | Delete modifier | ✅ `Catalog.tsx:1325` |
| `/api/catalog/bundles` | GET | List bundles | ✅ `Catalog.tsx` |
| `/api/catalog/bundles/:id` | PUT | Update bundle | ✅ `Catalog.tsx:1342` |
| `/api/catalog/bundles/:id` | DELETE | Delete bundle | ✅ `Catalog.tsx:1361` |

**Frontend callers:** `src/services/api.ts` exports these methods; called from:
- `src/pages/Catalog.tsx` (~30+ calls)
- `src/pages/ProjectWorkspace.tsx` (~10+ calls)
- Other components via `useCatalogWorkspaceQuery` hook

**Comment in code (legacyRouter.ts:22-27):**
```typescript
/**
 * Legacy catalog CRUD endpoints (mounted at `/api`).
 *
 * Retained because the current client still calls these for catalog item, modifier,
 * and bundle edits. The old monolithic `/projects`, `/settings`, `/estimate/calculate`,
 * `/global/*`, and `/sync/sheets` routes were removed in the 2026-04-16 cleanup —
 * all live callers now use `/api/v1/*`.
 */
```

This comment is accurate: **non-catalog legacy routes have been successfully removed**, but **catalog routes remain required**.

---

### 1.2 v1 API (`/api/v1/*`) — Primary API Surface

**Location:** `src/server/routes/v1/index.ts`
**Mounted at:** `/api/v1` in `server.ts:103`
**Status:** ✅ **Fully functional and primary**

#### Sub-routers

| Router | File | Purpose | Status |
|--------|------|---------|--------|
| `authRouter` | `authRoutes.ts` | Password login/logout/session | ✅ Active |
| `projectsRouter` | `projectsRoutes.ts` | Projects CRUD, peer defaults, files | ✅ Active |
| `roomsRouter` | `roomsRoutes.ts` | Rooms CRUD | ✅ Active |
| `takeoffRouter` | `takeoffRoutes.ts` | Takeoff lines, summary, finalize | ✅ Active |
| `settingsRouter` | `settingsRoutes.ts` | Settings, catalog sync, proposal draft | ✅ Active |
| `modifiersRouter` | `modifiersRoutes.ts` | Modifiers read, apply, remove | ✅ Active |
| `bundlesRouter` | `bundlesRoutes.ts` | Bundles read, items | ✅ Active |
| `intakeRouter` | `intakeRoutes.ts` | Intake parse, templates | ✅ Active |
| `div10BrainRouter` | `div10BrainRoutes.ts` | Div10 brain admin (gated) | ✅ Active |
| `catalogHealthRouter` | `catalogHealthRoutes.ts` | Catalog sync status | ✅ Active |

**Gap:** v1 API has **no catalog CRUD routes** (items, modifiers, bundles POST/PUT/DELETE). The v1 routes only **read** modifiers and bundles; they do not support **writes**.

---

## 2. Persistence Mode Inventory

### 2.1 Database Driver Selection

**Environment variable:** `DB_DRIVER` (default: `sqlite`)
**Location:** `src/server/db/driver.ts`

```typescript
export function isPgDriver(): boolean {
  return String(process.env.DB_DRIVER || 'sqlite').trim().toLowerCase() === 'pg';
}
```

**Modes:**
- `DB_DRIVER=sqlite` (default): Uses local `better-sqlite3` with `estimator.db` file
- `DB_DRIVER=pg`: Uses pooled Postgres connection via `DATABASE_URL`

### 2.2 Catalog Backend Selection

**Environment variable:** `CATALOG_BACKEND` (default: `auto`)
**Location:** `src/server/db/catalogBackend.ts`

```typescript
export function resolveCatalogBackendSetting(): ResolvedCatalogBackendMode {
  const raw = String(process.env.CATALOG_BACKEND || '').trim().toLowerCase();
  if (raw === 'sheet' || raw === 'local' || raw === 'sqlite') return 'local';
  if (raw === 'supabase' || raw === 'pg') return 'supabase';
  return 'auto';
}
```

**Modes:**
- `auto` (default): Postgres catalog when `DB_DRIVER=pg`, else SQLite
- `local`/`sheet`/`sqlite`: Force SQLite catalog (incompatible with `DB_DRIVER=pg`)
- `supabase`/`pg`: Force Postgres catalog (requires `DB_DRIVER=pg`)

### 2.3 Query Abstraction Layer

**Location:** `src/server/db/query.ts`

All database access goes through abstraction functions that dispatch to SQLite or Postgres:

| Function | Purpose | SQLite Path | Postgres Path |
|----------|---------|-------------|---------------|
| `dbAll()` | Query multiple rows | `better-sqlite3` | `pg` pool |
| `dbGet()` | Query single row | `better-sqlite3` | `pg` pool |
| `dbRun()` | Execute write | `better-sqlite3` | `pg` pool |
| `dbCatalogAll()` | Catalog reads | SQLite or PG (per `CATALOG_BACKEND`) | `pg` pool |
| `dbCatalogGet()` | Catalog reads | SQLite or PG (per `CATALOG_BACKEND`) | `pg` pool |
| `dbCatalogRun()` | Catalog writes | SQLite or PG (per `CATALOG_BACKEND`) | `pg` pool |

**Key insight:** The repo is **already fully abstracted** for dual persistence. SQLite cannot be safely removed because:
1. It's the default for local dev
2. Tests rely on it (`npm test` runs without Docker Postgres)
3. No breaking changes required to keep it

**Status:** ✅ **Both modes are production-ready**; choice is deployment-time configuration.

---

## 3. Auth Path Inventory

### 3.1 Auth Entry Points

**Location:** `src/context/AuthContext.tsx`

The `signIn()` method attempts **three auth paths in waterfall order**:

```typescript
async function signIn(email: string, password: string, remember: boolean): Promise<boolean> {
  // PATH 1: Try Supabase auth (if configured)
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return true;
    /* Fall through to server password session when Supabase rejects credentials. */
  }

  // PATH 2: Try server password session (if AUTH_LOGIN_PASSWORD is set)
  const res = await fetch('/api/v1/auth/password-login', { ... });
  if (res.ok) return true;

  // PATH 3: Legacy client-only fallback (accepts any password)
  if (!supabase) {
    // Store email in localStorage/sessionStorage, no server validation
    return true;
  }
  return false;
}
```

### 3.2 Auth Path Details

| Path | Trigger | Server Validation | Storage | Status |
|------|---------|-------------------|---------|--------|
| **Supabase** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | ✅ Yes (Supabase Auth API) | Supabase session cookies | ⚠️ Optional |
| **Server password session** | `AUTH_LOGIN_PASSWORD` set | ✅ Yes (server-side cookie) | HTTP-only cookie (`express-session` style) | ⚠️ Optional |
| **Legacy client-only** | Neither Supabase nor password is configured | ❌ **No** (accepts any password) | `localStorage` / `sessionStorage` | ⚠️ **Insecure fallback** |

**Server password session implementation:**
`src/server/routes/v1/authRoutes.ts` + `src/server/auth/passwordSession.ts`

**Middleware:**
`src/server/routes/v1/index.ts:29` — `requireSession` middleware guards all v1 routes except `/auth` and `/session`

### 3.3 Current Reality

- If neither `VITE_SUPABASE_URL` nor `AUTH_LOGIN_PASSWORD` is set, **any password is accepted** client-side only
- The server still enforces `requireSession` middleware, but the session is populated from legacy localStorage
- This is documented in `AuthContext.tsx:119` as "Legacy client-only fallback when server auth is not configured (AUTH_REQUIRED=0)"

**Status:** ⚠️ **Three parallel auth paths exist**; the legacy fallback is **not production-safe** but is intentionally kept for local dev convenience.

---

## 4. Frontend API Call Patterns

### 4.1 API Client: `src/services/api.ts`

This file exports a single `api` object with ~80+ methods. Methods are named by version:

- **v1 methods:** `getV1Projects()`, `createV1Project()`, etc. → call `/api/v1/*`
- **Non-versioned methods:** `getCatalog()`, `createCatalogItem()`, etc. → call `/api/catalog/*` (legacy)

### 4.2 Legacy API Callers

Frontend files calling **legacy** `/api/*` catalog endpoints:

| File | Methods Called | Lines |
|------|----------------|-------|
| `src/pages/Catalog.tsx` | `createCatalogItem`, `updateCatalogItem`, `deleteCatalogItem`, `listCatalogItemAliases`, `createCatalogItemAlias`, `deleteCatalogItemAlias`, `listCatalogItemAttributes`, `createCatalogItemAttribute`, `deleteCatalogItemAttribute`, `updateCatalogModifier`, `deleteCatalogModifier`, `updateCatalogBundle`, `deleteCatalogBundle` | ~30+ calls |
| `src/pages/ProjectWorkspace.tsx` | `getCatalog`, `createCatalogItem` | ~10+ calls |
| `src/pages/Settings.tsx` | `getCatalogSyncStatus`, `getCatalogSyncRuns` | ~6+ calls |
| Other components | Various catalog reads | ~90+ calls |

**Total legacy API calls in frontend:** ~137 (per `grep` count)

**Status:** ⚠️ **Cannot remove legacy routes until v1 catalog CRUD is implemented and frontend is migrated**.

---

## 5. Documentation Audit

### 5.1 README.md Status

**Location:** `/README.md`

#### Accurate Sections ✅
- Tech stack (React, Express, SQLite) — accurate for default mode
- Getting started / install / dev commands
- UI formatting system description
- Upload parsing architecture (appears twice — duplication at lines 93-118 and 119-144)
- Google Sheets catalog sync details
- Deployment readiness

#### Misleading or Incomplete Sections ⚠️
- **Line 3:** "SQLite persistence" — does not mention Postgres/Supabase option
- **Line 80:** "Legacy API remains available under `/api/*` while rebuild proceeds" — **vague**; doesn't clarify that legacy API is *required* for catalog CRUD
- **Lines 82-91:** Lists v1 API routes but does not mention the catalog CRUD gap
- **Lines 119-144:** Duplicate "Upload Parsing Architecture" section (exact repeat)
- **Lines 145-150:** "Database Notes" section says "legacy and v1 tables coexist" but does not mention `DB_DRIVER` or dual-mode persistence

#### Missing Sections ❌
- No mention of `DB_DRIVER` or `CATALOG_BACKEND` environment variables
- No mention of auth configuration options (Supabase vs password vs fallback)
- No explanation of why legacy API still exists (catalog CRUD gap)
- No migration/transition roadmap visibility

### 5.2 docs/app-audit-and-roadmap.md Status

**Location:** `/docs/app-audit-and-roadmap.md`

This document is **excellent and accurate**. It contains:
- Honest capability inventory
- Clear shortfall matrix
- Concrete closing moves
- Ordered roadmap (Phases 4-6)

**Status:** ✅ **Accurate and valuable** — should be referenced in README

---

## 6. Stale Code Inventory

### 6.1 Comments Mentioning Removed Code

`legacyRouter.ts:22-27` correctly states that non-catalog legacy routes were removed in 2026-04-16. This comment is **accurate**.

### 6.2 Potentially Unused Legacy Tables

From `docs/app-audit-and-roadmap.md §3.5`:

| Item | Status | Verification Needed |
|------|--------|---------------------|
| `global_bundles`, `global_addins` tables | Mentioned as "delete behind safe migration" | ⚠️ Verify no code references these |
| Legacy project/scope types in `src/types.ts` | "Coexist with v1 types" | ⚠️ Verify usage, consider migration |

**Action required:** Grep for `global_bundles`, `global_addins`, legacy `Project` / `Scope` types before removing.

---

## 7. Summary: What Can/Cannot Be Removed

### Safe to Remove ✅ (after verification)
- Duplicate "Upload Parsing Architecture" section in README (lines 119-144)
- `global_bundles`, `global_addins` tables (if unused)
- Legacy `Project` / `Scope` types in `src/types.ts` (if unused)

### Cannot Remove Yet ⚠️
- **Legacy `/api/catalog/*` routes** — required by frontend (137+ calls)
- **SQLite support** — default for local dev + tests
- **Legacy client-only auth fallback** — intentionally kept for local dev

### Should Not Remove ✅ (keep)
- **Postgres/Supabase support** — production-ready, opt-in
- **Server password session auth** — production-ready, opt-in
- **v1 API** — primary API surface

---

## 8. Recommended Immediate Actions

### Phase 1: Documentation Hygiene (Low Risk)
1. ✅ Update README to accurately reflect dual API reality (v1 primary, legacy catalog-only)
2. ✅ Remove duplicate "Upload Parsing Architecture" section in README
3. ✅ Document `DB_DRIVER` and `CATALOG_BACKEND` environment variables in README
4. ✅ Document auth configuration options (Supabase vs password vs fallback) in README
5. ✅ Add reference to `docs/app-audit-and-roadmap.md` in README

### Phase 2: Inline Comments (Low Risk)
6. ✅ Add comment to `server.ts:103-104` explaining mount order and why both APIs exist
7. ✅ Add comment to `src/services/api.ts` explaining v1 vs non-versioned method naming
8. ✅ Add comment to `AuthContext.tsx` explaining three auth paths

### Phase 3: Code Verification (Before Any Removal)
9. ⚠️ Grep for `global_bundles`, `global_addins` usage
10. ⚠️ Grep for legacy `Project` / `Scope` type usage in `src/types.ts`
11. ⚠️ Verify no other files call removed legacy routes (non-catalog)

### Phase 4: Future Work (Do NOT Do Now)
- ❌ Do NOT remove legacy catalog routes until v1 catalog CRUD is implemented
- ❌ Do NOT remove SQLite support (keep as default for local dev)
- ❌ Do NOT change auth behavior (current waterfall is intentional)

---

## 9. Risk Assessment

| Change Type | Risk Level | Blast Radius |
|-------------|------------|--------------|
| Update README | 🟢 Low | Documentation only |
| Add inline comments | 🟢 Low | Code clarity only |
| Remove duplicate README section | 🟢 Low | Documentation only |
| Verify unused tables/types | 🟡 Medium | Requires grep/testing |
| Remove verified-unused code | 🟡 Medium | Requires testing |
| Remove legacy catalog routes | 🔴 High | **Breaks frontend** — requires v1 implementation first |
| Remove SQLite support | 🔴 High | **Breaks local dev + tests** |
| Change auth behavior | 🔴 High | **Breaks login** |

---

## 10. Conclusion

The repo is in a **healthy transitional state**:
- v1 API is functional and handles most operations
- Legacy catalog routes are **intentionally retained** and **actively used**
- Dual persistence (SQLite/Postgres) is **fully abstracted** and **production-ready**
- Auth has three paths, with legacy fallback **intentionally kept for dev convenience**

**The migration is not stalled — it's incomplete by design.** The next step is to:
1. Document the current reality accurately (this PR)
2. Build v1 catalog CRUD routes (future PR)
3. Migrate frontend to v1 catalog routes (future PR)
4. Remove legacy catalog routes (future PR)

**This audit enables safe, incremental cleanup without breaking the app.**
