# MVP Smoke Checklist — Results

**Date:** 2026-05-19  
**Commit tested:** `19a146b` (+ uncommitted local changes on disk)  
**Environment:** Local `.env.local` — **not** the target Sheets+GCS profile (see `docs/full-app-qa-report.md`)  
**Browser session:** **None** — manual UI steps below are **unchecked / not verified**

Legend: ✅ Verified · ⚠️ Partial · ❌ Failed · ⬜ Not tested · 🚫 Blocked

---

## Automated preflight (2026-05-19)

| Check | Status | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ | ~54s |
| `npm test` | ✅ | 342 pass, 3 skipped, 0 fail |
| `GET /healthz` | ✅ | ~161ms |
| `GET /api/v1/health` | ✅ | Server on pg (current env) |
| `GET /api/v1/projects` | ✅ | ~573ms |
| `GET /api/v1/catalog/items` | ✅ | Reads `GOOGLE_SHEETS:CatalogItems` ~980ms |
| `GET /api/admin/div10-sheets/health` | ❌ | `ok: false` — header mismatches |
| GCS upload probe (`brightenlabor518`) | 🚫 | IAM `storage.objects.create` denied |
| Target env in `.env.local` | ❌ | Still pg + Supabase |

---

## 1. Create project

- ⬜ Projects → create new project
- ⬜ Workspace opens without crash
- ⬜ Loading shows spinner labeled **Loading**
- **Code-only:** `RouteFallback` uses “Loading”; project intake polish **uncommitted**

## 2. Setup

- ⬜ Project name, customer, address saved
- ⬜ Wall substrate and blocking/backing status set
- ⬜ Tax/location settings apply if used
- ⬜ Navigate away and back — values persist

## 3. Import Bobrick quote

- ⬜ Quotes tab → add/import quote
- ⬜ **Import ready rows** shows **Importing…** while in flight
- ⬜ Import Result modal opens on success
- 🚫 **Blocked** until Sheets staged-row headers validated or import smoke passes

## 4. Import Result modal

- ⬜ Imported lines listed with correct descriptions
- ⬜ Labor-ready lines show **Labor ready**
- ⬜ Paused lines show **Needs install assumptions** (no raw flags)
- ⬜ Excluded/ignored rows grouped separately
- **Automated:** `quoteImportResultSummary.test.ts` ✅

## 5. Estimate

- ⬜ Imported lines visible in cockpit/grid
- ⬜ Totals reasonable vs quote

## 6. Estimate Line Detail drawer

- ⬜ Open via Detail or double-click
- ⬜ Source quote, catalog match, material/labor visible
- ⬜ No raw install flags in UI
- ⬜ Unsaved close → confirm discard
- ⬜ Save persists edits
- **Automated:** `estimateLineDetailModel.test.ts` ✅ (sanitization)

## 7. Install Assumptions (paused labor)

- ⬜ Open from paused line; drawers don’t stack awkwardly
- ⬜ Set blocking/backing → save and recalculate
- ⬜ Labor becomes **Labor ready**
- **Automated:** `installAssumptionDrawer.test.ts`, `installIntelligenceLineUi.test.ts` ✅

## 8. Hide from proposal

- ⬜ Confirm Exclude modal
- ⬜ Line hidden internally but on estimate
- ⬜ Not in proposal or print
- **Automated:** `proposalPrintModel.test.ts` ✅

## 9. Proposal

- ⬜ Proposal tab preview loads
- ⬜ No internal notes/flags in preview

## 10. Print / PDF options

- ⬜ **Print / PDF** opens options modal
- ⬜ Summary / Detailed previews
- ⬜ Browser print — proposal only
- ⬜ Totals match visible lines only
- ⬜ No internal markers in output
- **Automated:** `proposalPrintModel.test.ts` ✅

## 11. Regression guards

- ⬜ Excluded quote rows not on estimate/print
- ⬜ Signature block layout OK
- ⬜ No bad page breaks

---

## Known deferred (from checklist — still open)

- Install assumptions drawer: no discard confirm on cancel
- Duplicate line / save proposal: no busy spinner yet

---

## Sign-off

| Role | Ready for real project testing? | Notes |
|---|---|---|
| Automated | **No** | Env + GCS + Sheets health blockers |
| Manual UI | **Pending** | Run after fixing `.env.local`, IAM, headers |

**Next action:** Fix P0 items in `docs/full-app-qa-report.md` §15, then re-run this checklist in the browser and change ⬜ → ✅/❌.
