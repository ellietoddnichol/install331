# Catalog curation workflow — friction and mitigations

## Friction map (highest impact first)

1. **Sync review finding → curated row → edit → save**  
   Operators read a line in “Manual review queues” or sync warnings, then must mentally copy a SKU/token, jump to search, find the row, open the editor, fix, save. Each hop loses context (which queue, which filter, refresh/share).

2. **Context loss on refresh or share**  
   Tab, duplicate-review mode, sheet-tab filter, and search were mostly client-only until this pass: reloading or sending a link did not restore the same browse surface.

3. **Duplicate-review and quality queues**  
   Duplicate groups, quality table, and image sprint are separate “modes” (checkboxes/panels). Switching between them without URL state made deep links and handoffs awkward.

4. **No single-step “take me to this record” link**  
   `?q=` alone can match multiple rows; record id was not addressable in the URL, so “this exact row” handoffs relied on SKU uniqueness and manual search.

## Implemented mitigations (client-only)

| Area | Change |
|------|--------|
| **URL sync** | Catalog browse state is written to the query string (`replace`, so history is not spammed). Parsed on load and when `searchParams` change (e.g. in-app links, browser back/forward). |
| **Query keys** | `tab`, `q`, `sheet` (workbook tab filter), `canon`, `dup`, `dep`, `drev`, `qual`, `img`, `cat`, `itype`, `act`, `sort`, `catalogItem` (item id). |
| **`catalogItem` deeplink** | Opening the item editor (or loading with `?catalogItem=<uuid>`) keeps id in the URL; closing clears it. While workspace data is still loading, `catalogItem` is preserved so it is not stripped before items arrive. |
| **Manual review → Catalog** | “Open in Catalog” uses `catalogCuratorPath` so duplicate SKU queue links include `dup=1` and `drev=1` where appropriate. Added **Copy link** (absolute URL) per preview row. |
| **Duplicate groups table** | Per row: **Link** (React Router) and **Copy** deep link with `q`, `catalogItem`, `dup`, `drev` for handoff. |
| **Editor context** | When restrictive filters or queues are active, **badges** above the item editor summarize filters/search so curators see why the row surfaced. |
| **Keyboard** | **`/`** focuses catalog search when focus is not in an input/textarea/select/contenteditable. **Escape** closes whichever catalog modal is open (item, modifier, bundle). |

Implementation lives in `src/pages/Catalog.tsx` and `src/shared/catalogReviewQueues.ts` (`catalogCuratorPath`, `catalogCuratorPathDeep`).

## Out of scope (this iteration)

- Backend/API or schema changes; workbook-first sync behavior unchanged.  
- Server-rendered or shortened links; clipboard and URLs assume the app origin the user already has.  
- Full “findings” taxonomy beyond existing manual-review table and duplicate/quality panels.  
- Modifier/bundle record ids in the URL (items are the primary curation target for sync findings).  
- Resolving `catalogItem` when the id exists only after sync (handled by strip-invalid-id only after items load).

## Constraints

- **Workbook-first** preserved: no new writes paths; all changes are query params and UI.  
- **Minimal surface**: no new API client module required.  
- **Typecheck**: repo-wide `tsc` currently fails in unrelated files (`RoomManager.tsx`, `ProjectIntake.tsx`); `Catalog.tsx` and `catalogReviewQueues.ts` typecheck clean.

## Before / after (short operator flow)

**Before (typical)**  
1. Read finding in sync panel → click or type `/catalog?q=TOKEN` → re-apply duplicate-review / sheet filters by hand → scan grid → open row → edit → save. Refresh loses context.

**After**  
1. Click **Search “TOKEN”** (with queue presets where applicable) or **Copy link** → land with `q`, `dup`/`drev`, etc. restored → optional `catalogItem` opens editor directly → badges show active filters → **`/`** refocuses search → **Escape** closes editor → save clears editor and `catalogItem` from URL.
