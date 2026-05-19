# MVP Smoke Checklist — Results

**Date:** 2026-05-19  
**Commit:** `70968fe` + local (`fix(security)` pending)  
**Environment:** Sheets + sqlite + GCS (`.env.local` migrated on disk)  
**Browser session:** **Pending — run manually at http://localhost:3000**

Legend: ✅ Verified · ⚠️ Partial · ❌ Failed · ⬜ Not tested · 🚫 Blocked

---

## Automated / API preflight (2026-05-19, post-restart)

| Check | Status | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ | |
| `npm test` | ✅ | 342+ pass (includes vite security tests after move) |
| `GET /healthz` | ✅ | |
| `GET /api/v1/health` | ✅ | **`database: "sqlite"`** (no longer `pg`) |
| `integration-health` | ✅ | `dbDriver: sqlite`, `catalogDataSource: sheets`, Supabase flags **false** |
| GCS probe (upload/read/delete) | ✅ | ~965ms / 81ms / 213ms on `brightenlabor518` |
| `GET /api/admin/div10-sheets/health` | ⚠️ | `ok: false` — see failing tabs below (CatalogItems tab OK) |
| Target `.env.local` on disk | ✅ | Migrated from stale pg/Supabase copy; **save/merge editor if open** |

### Sheets health — failing tabs (headers)

**Project workbook:** Projects, ProjectModifiers, EstimateLines, ProposalSections, ProjectAlternates, ProjectClarifications, ProjectExclusions  
**Vendor intake:** SourceQuotes, StagedQuoteRows, QuoteAdjustments, QuoteTerms, ParserProfiles, VendorAliases  
**Catalog labor:** CatalogAliases, ManufacturerAliases, LaborFallbackRules, InstallLaborFamilies, CategoryDefaults, AddIns, Bundles, BundleItems, Modifiers  

**Passing catalog tabs:** CatalogItems (and others per last seed). Re-run `npm run seed:div10-sheets` if headers drift.

---

## 1. Create project

- ⬜ Projects → create new project
- ⬜ Workspace opens without crash
- ⬜ Loading shows spinner labeled **Loading**
- **Code:** project intake + safer delete in `70968fe`

## 2. Setup

- ⬜ All setup fields persist after refresh

## 3. Import Bobrick quote

- ⬜ Full import path
- ⚠️ StagedQuoteRows headers fail health check — **test import anyway**; may still work if runtime mapping differs

## 4–11. Estimate → Print/PDF

- ⬜ **Manual browser only** — see `docs/mvp-smoke-checklist.md`

**Automated (no browser):** print model, import summary, line detail sanitization, install assumption copy — unit tests ✅

---

## Sign-off

| Role | Ready? | Notes |
|---|---|---|
| API / env | **Almost** | SQLite + GCS OK; Sheets headers need alignment or confirmed runtime tolerance |
| Manual UI | **Pending** | You run the checklist in the browser |

**Next:** Browser smoke → then `fix(security): keep AI provider keys server-side` (vite define removed locally).
