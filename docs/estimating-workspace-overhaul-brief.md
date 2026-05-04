# Division 10 estimating workspace — overhaul brief

**Status:** Product / UX source of truth for a workflow and layout overhaul (not a light reskin).  
**Intent:** One professional path: intake → scope review → estimate → proposal, with Div 10–specific logic preserved.

**Concrete targets, acceptance criteria, non-regression checklist, visual gate, risks:**  
[`estimating-workspace-implementation-spec.md`](./estimating-workspace-implementation-spec.md)

---

## Priority order (do in this sequence)

1. **Navigation + page structure** — few primary sections, clear IA, left nav for page-level movement.  
2. **Scope Review redesign** — exceptions-first, confidence/status, expandable detail.  
3. **Estimate workspace redesign** — large grid, persistent totals, grouping, Add Items vs Add-Ins.  
4. **Labor / crew logic presentation** — credible crew sizing, visible drivers and assumptions.  
5. **Proposal polish + print/export** — client-ready layout, working preview/print/submit.  
6. **Modifiers / adders UX** — line vs project, impact visible, structured naming.

---

## 1. Global app structure

**Goal:** Few clear primary sections; remove cluttered nested tabs; one primary purpose per page; workflow obvious end-to-end.

**Preferred primary IA**

| Primary | Role |
|--------|------|
| Dashboard | Control center |
| Scope Review | Exception-driven review |
| Estimate | Main pricing workspace |
| Proposal | Client-ready output |

**Secondary** (must still feel subordinate): Catalog, Settings, Admin / templates.

**Mechanics**

- Clean **left-side navigation** for page-level movement.  
- **No** heavy nested tab systems as the main way to move through the job.  
- Each page: **one** primary purpose.

---

## 2. Look and feel (non‑negotiable direction)

- Professional, **app-like** (not spreadsheet / internal tool).  
- Strong **spacing and hierarchy**; less visual noise; fewer scattered buttons.  
- Better use of **width**; less dead side space; **larger** primary content areas.  
- Cleaner **typography**; intentional **grouping** of controls.  

**Explicit:** Rework **layouts and interaction patterns**, not only card chrome.

---

## 3. Dashboard

Must be a **real control center**, not filler.

**Show (at minimum):**

- Project name and status  
- Estimate mode / status  
- Current estimate summary  
- High-level pricing snapshot  
- Important assumptions or warnings  
- Items needing review  
- Quick actions → Scope Review, Estimate, Proposal  

**Answer at a glance:**

- Where is this job in the process?  
- What needs attention?  
- What is the current number?

---

## 4. Scope Review

**Philosophy:** Review by **exception**, not manual inspection of everything.

**Required**

- Strong matches feel **handled**; user focuses on **uncertain / unmatched** lines.  
- Ambiguous lines **stand out**; each row: clear **status**.  
- Reasoning / evidence **available on demand**, not dominating the viewport.  
- Rows **scannable** and comparable; **cleaner grouping**.  
- **Expandable** detail instead of everything at once.  
- Div 10 Brain advisory: **useful but secondary**.

**Each review row should communicate**

- Original text  
- Suggested match  
- Confidence  
- Scope bucket  
- Modifiers/adders if any  
- Evidence/reasoning on demand  
- Current application status  

**Scope buckets** must be visually understandable:

- Priced base scope  
- Line condition  
- Project condition  
- Exclusions / by others  
- Alternates / deductions  
- Informational only  

**Behavior**

- Start closer to **exceptions only**; avoid forcing review of **high-trust** lines.  
- Reduce row noise.

---

## 5. Estimate page

**Primary working screen** for pricing — not a cluttered form.

**Layout**

- **Large** main estimate grid  
- **Persistent totals / footer** always visible  
- Clear line organization; **clean grouping / collapsing** for bundles and sections  

**Interaction**

- **Separate** “Add Items” from “Add-Ins / Modifiers”  
- Add-ins update totals **immediately**; pricing effects **obvious**  
- Install/material splits **easy to understand**  
- Support **install-only**, **material-only**, **both** — without confusion  
- Bundles feel **native**, not bolted on  

**User questions the screen must answer**

- What is included?  
- What is driving cost?  
- Labor vs material?  
- Which modifiers apply?  
- **Current total right now?**

---

## 6. Crew size and labor presentation

**Problem:** Huge jobs cannot read as **one worker** for unrealistic duration.

**Required**

- Crew suggestions **scale** with workload  
- Heavy / multi-person installs → **more than one** installer when appropriate  
- Long durations → **smarter** crew sizing  
- Labor assumptions **inspectable**  
- UI makes **why** a crew recommendation exists obvious  

**Surface clearly**

- Labor hours  
- Duration  
- Crew count  
- Major labor drivers  
- Assumptions affecting labor  

Must feel **credible** to someone actually pricing work.

---

## 7. Modifiers and adders

**Required**

- **Clear separation**: line-level vs project-level modifiers  
- Cleaner naming and grouping  
- Applied conditions visible **without** overwhelming the screen  
- **Pricing impact** clear  

**Examples that must fit naturally** (not hidden traps): union/prevailing, night work, overtime, travel premium, demo, height, masonry drilling, access/occupied, multi-level, bond, tax.

---

## 8. Proposal page

**Goal:** Client-ready, polished, print-quality — not an internal dump.

**Required**

- Professional layout; strong hierarchy  
- **Working** preview, print, export  
- Control over standard language  
- **Company branding** from settings automatically  
- Clear **install vs material** when applicable  
- **No** room-based grouping in final output **unless explicitly requested**  

**Already specified**

- “Professional Installation” (or equivalent) wording **editable**  
- **Overhead omitted** from proposal output when set to **0**  
- User/company settings **flow into** proposal automatically  

---

## 9. Functional UX cleanup

Must be **behaviorally** complete, not only visual.

- No dead buttons  
- **Submit Bid** works  
- **Preview** works  
- **Print Proposal** works  
- Totals update **correctly**  
- Review decisions **carry through** to estimate  
- Add-ins and estimate edits feel **immediate and reliable**

---

## 10. End-to-end workflow (product promise)

1. Intake arrives  
2. Scope classified and matched  
3. User reviews **only what needs attention**  
4. Estimate built in a **clean workspace**  
5. Labor / material / modifiers **understandable**  
6. Proposal **polished and sendable**

Pieces must feel like **one system**, not stitched tools.

---

## 11. What absolutely cannot be lost

Any redesign that **removes** the following to simplify UI is **out of scope** without explicit sign-off and a replacement plan.

### A. Core estimating modes

- Install-only  
- Material-only  
- Combined install + material  

### B. Running pricing clarity

- Persistent running total behavior  
- Clear labor / material breakdowns  
- Immediate updates when add-ins apply  
- Item- and project-level pricing transparency  

### C. Custom markup / pricing sequence

Preserve this sequence unless product explicitly approves a change:

1. Direct costs  
2. Overhead  
3. Profit on **direct + overhead**  
4. Bond  
5. Tax  

Do **not** silently collapse into generic markup.

### D. Modifier structure

- Line-level modifiers  
- Project-level modifiers  
- Suggested project conditions  
- Distinction between **scope items** vs **conditions/adders**

### E. Div 10–specific intelligence

- Div 10–specific matching behavior  
- Div 10 Brain **advisory** logic  
- Scope-bucket handling (exclusions, alternates, line/project conditions, informational)  
- Shorthand / domain reasoning where implemented  

### F. Catalog and sync

- Catalog sync behavior  
- Admin_DB structure support  
- Search_Key–driven lookup logic  
- Bundles tied to real SKUs/modifiers  
- Normalized naming work  
- Catalog/admin data remains **backbone** of the estimator  

### G. Bundles

- ADA bundles  
- Seeded bundle templates  
- Bundle grouping/collapsing  
- Bundle-to-real-item linkage  
- Correct modifier key behavior  

### H. Proposal requirements

- Proposal **not** grouped by room (unless explicitly requested)  
- Editable standard language  
- Company identity / settings flow into proposal  
- Clean install/material presentation  
- Overhead hidden at 0  
- Print-quality goal  

### I. Labor logic

- Smarter labor modeling expectations  
- Realistic multi-person crew suggestions  
- Visibility into labor drivers  
- RSMeans-style / structured labor direction where applicable  

### J. User-requested exclusions

- Do **not** reintroduce removed concepts (e.g. labor burden) without confirmation  
- Do **not** strip custom workflows without confirmation  
- Do **not** replace required sync with manual-only without confirmation  

---

## 12. Blunt diagnosis (why it still feels unchanged)

Likely causes:

- Incremental **styling** or small features instead of **flow** and **page** redesign  
- Insufficient **simplification** of navigation and primary tasks  
- Insufficient **estimating-workspace** thinking (grid, totals, labor credibility)  
- Insufficient **proposal** polish and print path  

**Corrective:** Treat as **product design + IA + interaction**, not feature patching.

---

## 13. Message for implementers (use verbatim when scoping work)

The app still does not feel meaningfully improved. I did not ask for a light reskin. I asked for a **workflow and UI overhaul** that makes the product feel like a clean, professional Division 10 estimating workspace.

**What needs to change**

- Simplify navigation into a small number of clear primary sections.  
- Make Dashboard, Scope Review, Estimate, and Proposal each feel **intentional**.  
- Redesign Scope Review around **exceptions only** and clearer confidence/status handling.  
- Redesign Estimate into a **large-grid workspace** with persistent totals, cleaner grouping, and better Add Items vs Add-Ins interaction.  
- Make labor/crew suggestions **smarter** and present them more **credibly**.  
- Make modifiers/adders clearer at **line** and **project** level.  
- Make Proposal **polished**, client-facing, and print-ready.  
- Remove clutter, weak hierarchy, wasted space, and spreadsheet-like feel.  
- Ensure all **major actions work end to end**.

**What cannot be lost**

- Install-only / material-only / both modes  
- Div 10–specific logic and scope bucket handling  
- Catalog sync behavior  
- Bundle logic  
- Custom markup sequence  
- Proposal requirements already specified  
- Specific customizations and anything previously removed by request  

**Rule:** Do not strip custom functionality to make the UI simpler. If a redesign risks losing capability, **stop and flag it** before changing.

---

## 14. How to use this doc in Cursor

- Tag tasks with section numbers (e.g. “§4 Scope Review — exceptions filter”).  
- Before deleting or merging routes/components, check **§11**.  
- Prefer **incremental PRs** aligned to **Priority order** at the top, each shippable without breaking §11.
