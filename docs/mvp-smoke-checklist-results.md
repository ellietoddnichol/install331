# MVP Smoke Checklist — Results

**Date:** 2026-05-19  
**Commits:** `70968fe` (Sheets/GCS MVP) · `371fa0a` (security)  
**Environment:** `DB_DRIVER=sqlite`, `DATA_BACKEND=sheets`, GCS + service-account JSON  
**Browser:** **You** — run manually at http://localhost:3000  

Legend: ✅ Pass · ⚠️ Partial · ❌ Fail · ⬜ Browser not run · 🔧 API-only

---

## Automated preflight

| Check | Status | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ | |
| `npm test` | ✅ | 344 pass |
| `GET /api/v1/health` | ✅ | `database: "sqlite"` |
| `integration-health` | ✅ | Supabase flags false, `catalogDataSource: sheets` |
| GCS probe (standalone) | ✅ | upload/read/delete OK on `brightenlabor518` |
| `npm run seed:div10-sheets` | ✅ | Scripts: **`seed:div10-sheets`** and **`seed:div10-sheets:dry`** (Div 10; not `motion10`) |
| Sheets admin health | ⚠️ | `ok: false` — header validator strict; see `docs/full-app-qa-report.md` |

---

## API workflow smoke (`npx tsx scripts/mvp-api-smoke.ts`)

Run after `npm run dev`. Full JSON: `docs/mvp-smoke-api-results.json`.

| Step | API result | Time (approx) | Notes |
|---|---|---:|---|
| Create project | ✅ | ~25s | Sheets `Projects` tab |
| Save setup | ✅ | ~13s | wallSubstrate, blocking, tax |
| Upload file → GCS | ❌ | ~2s | **FK constraint** — `project_files_v1` (SQLite) references `projects_v1`, but project lives only in Sheets. GCS upload code path reached after NOT NULL fix. **Test file attach in browser** — UI may use different path. |
| Create Bobrick quote | ✅ | ~7s | |
| Stage rows (bulk) | ✅ | ~12s | 2 lines |
| Import to estimate | ✅ | ~29s | 2 estimate lines |
| List estimate lines | ✅ | <1s | |
| Hide from proposal (API) | ✅ | ~4s | `proposalVisibility: internal_only` |
| Proposal preview (pipeline API) | ❌ | — | **Expected in sheets mode** — `/api/v1/pipeline/.../proposal-preview` requires `DB_DRIVER=pg`. Proposal UI builds client-side from takeoff lines. |
| Install assumptions (API) | ⚠️ | — | **503 in sheets mode** — `POST .../install-assumptions` not implemented for Sheets yet |

**Conclusion:** Quote → estimate **works via API** despite Sheets health `ok: false`. Header validator may be stricter than runtime. **Browser still required** for modals, print, GCS UI upload, install-assumptions drawer.

---

## Browser checklist (`docs/mvp-smoke-checklist.md`)

### 1. Create project
- ⬜ Projects → create new project
- ⬜ Workspace opens; **Loading** spinner (not “Loading workspace?”)
- 🔧 API create project ✅

### 2. Setup
- ⬜ Name, customer, address, substrate, blocking persist after refresh
- 🔧 API setup update ✅

### 3. Import Bobrick quote
- ⬜ Quotes tab → add/import
- ⬜ **Importing…** on import button
- ⬜ Import Result modal
- 🔧 API: stage + import ✅ (paste/upload UI not tested)

### 4. Import Result modal
- ⬜ Copy, labor-ready / needs assumptions, no raw flags
- ⬜ Unit tests ✅ (`quoteImportResultSummary.test.ts`)

### 5. Estimate
- ⬜ Lines visible; totals reasonable
- 🔧 API: 2 lines imported ✅

### 6. Estimate Line Detail
- ⬜ Detail drawer; discard confirm; no `blocking_unknown` in UI
- ⬜ Unit tests ✅ (`estimateLineDetailModel.test.ts`)

### 7. Install Assumptions
- ⬜ Drawer from paused line; save → labor ready
- ⚠️ API returns 503 in sheets mode — **must verify in browser** (may use client-only path)

### 8. Hide from proposal
- ⬜ Confirm Exclude modal; line hidden in proposal/print
- 🔧 API hide ✅

### 9. Proposal tab
- ⬜ Preview loads; no internal flags
- ⬜ Browser only (no pg pipeline API in sheets mode)

### 10. Print / PDF
- ⬜ Options modal; Summary/Detailed; print chrome hidden; totals match visible lines
- ⬜ Unit tests ✅ (`proposalPrintModel.test.ts`)

### 11. Regression guards
- ⬜ Excluded rows, signature block, page breaks
- ⬜ Browser only

---

## Known issues from smoke

| ID | Severity | Finding |
|---|---|---|
| SM-1 | High | `project_files_v1` FK to SQLite `projects_v1` while projects are Sheets-only → API file upload fails |
| SM-2 | Medium | Install assumptions API not wired for `DATA_BACKEND=sheets` |
| SM-3 | Low | Sheets health validator fails many tabs; runtime import still worked |
| SM-4 | Info | `seed:div10-sheets*` script names are correct; ignore `div10` typo in old notes |

---

## Recommended next commit (after browser pass)

Pick one based on what you see:

```text
fix(storage): allow project file uploads in Sheets-first mode
fix(sheets): align workbook headers for Sheets-first MVP
fix(quotes): repair Sheets quote import with seeded headers
style(projects): polish project intake and safer delete action
```

---

## Sign-off

| Gate | Status |
|---|---|
| Architecture (sqlite + sheets + GCS) | ✅ |
| API quote → estimate | ✅ |
| Browser MVP | ⬜ **Run now** |
| Production-ready | ⬜ After browser + SM-1/SM-2 |
