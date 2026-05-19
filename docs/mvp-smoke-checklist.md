# Quote-driven MVP — manual smoke checklist

Run after `npm run dev` with a fresh or test project. Automated checks: `npx tsc --noEmit` and `npm test`.

## 1. Create project

- [ ] Projects → create new project
- [ ] Workspace opens without crash
- [ ] Loading shows spinner labeled **Loading** (not stale copy)

## 2. Setup

- [ ] Project name, customer, address saved
- [ ] Wall substrate and blocking/backing status set
- [ ] Tax/location settings apply if used
- [ ] Navigate away and back — values persist

## 3. Import Bobrick quote

- [ ] Quotes tab → add/import quote
- [ ] **Import ready rows** shows **Importing…** while in flight (no double-click duplicate)
- [ ] Import Result modal opens on success

## 4. Import Result modal

- [ ] Imported lines listed with correct descriptions
- [ ] Labor-ready lines show **Labor ready**
- [ ] Paused lines show **Needs install assumptions** (no `blocking_unknown`, no raw flags)
- [ ] Excluded/ignored rows grouped separately

## 5. Estimate

- [ ] Imported lines visible in cockpit/grid
- [ ] Totals reasonable vs quote

## 6. Estimate Line Detail drawer

- [ ] Open via Detail or double-click on grab bar line
- [ ] Source quote, catalog match, material pricing, labor status visible
- [ ] Assumptions readable; no raw install flags in UI
- [ ] Close with unsaved edits → confirm discard
- [ ] Save persists edits

## 7. Install Assumptions (paused labor)

- [ ] Open from paused line; line detail drawer closes (no stacked drawers)
- [ ] Set blocking/backing to **Included** → save and recalculate
- [ ] Labor becomes **Labor ready**; minutes/cost update

## 8. Hide from proposal

- [ ] Hide line → Confirm Exclude modal (above other modals if Print options was open)
- [ ] Confirm hide — line stays on estimate internally
- [ ] `internal_only` line not in Proposal preview or print

## 9. Proposal

- [ ] Proposal tab preview loads
- [ ] No internal notes/flags in preview

## 10. Print / PDF options

- [ ] **Print / PDF** opens options modal
- [ ] Preview **Summary** — professional layout, scope cards, no internal lines
- [ ] Preview **Detailed** with quantities — readable table
- [ ] Print / Save PDF — only proposal document (no sidebar/nav/modals)
- [ ] PDF black-and-white readable
- [ ] **Total investment** matches visible proposal lines only (hidden lines excluded from print totals)
- [ ] No `blocking_unknown`, parser/debug, exclusion reasons, or internal markers

## 11. Regression guards

- [ ] Excluded quote rows (`ignore`) not on estimate or print
- [ ] Signature block prints on one page section when enabled
- [ ] No awkward break splitting pricing summary or signature block

## Known deferred (non-blocking)

- Install assumptions drawer: no discard confirm on cancel (draft is small)
- Duplicate line / save proposal wording: no busy spinner yet
- `exportProposal` (jsPDF) legacy path still in codebase; UI uses browser print
