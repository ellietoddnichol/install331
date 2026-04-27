# Cursor action plan: Division 10 catalog migration & normalization

**Phase 1 (audit script):** [CATALOG_AUDIT.md](./CATALOG_AUDIT.md) — `npm run catalog:audit`, output under `reports/catalog-audit/`.

**Phase 2 (additive norm layer, no bulk data migration):** [ESTIMATOR_CATALOG_NORM_V1.md](./ESTIMATOR_CATALOG_NORM_V1.md) — `0003` migration, `estimatorNormCatalogRepo` / `resolveTargetCatalogItemIdBySkuOrAlias`.

**Premise:** This is a **database migration + catalog normalization** program, not a one-shot “clean the spreadsheet” task. Cursor Agent is strong at reading the repo, changing scripts, running `npm`/`tsx`, and iterating—but **broad, vague goals invite unintended pricing and matching regressions**. Work in **phases with audit artifacts and human review** between merges.

**Hard rules (all phases):**

- Do **not** delete catalog rows in place; prefer flags, staging tables, or **alias maps** that preserve old SKUs and search terms.
- Do **not** overwrite live SKUs without **alias / resolution** entries.
- Do **not** change estimate **pricing math** until **audit reports** exist and are reviewed.
- Do **not** collapse variant rows into one canonical item until **legacy identifiers** exist in the alias/resolution layer.
- Do **not** do large UI rewrites in the same pass as data migration; keep UI changes small and targeted.

**Reference on phased AI work:** See [Tomas Listiak, “Cursor vs Kiro…”](https://listiak.dev/blog/cursor-vs-kiro-which-ai-coding-tool-should-you-use-in-2026) (guardrails and task scope for coding agents).

---

## How to use Cursor tools in this project

| Tool | Use for | Avoid for |
|------|---------|-----------|
| **Agent Mode** | Migrations, TypeScript scripts, `supabase/migrations`, audit CSV generators, validation, targeted API/repo changes, running `npm run lint` / `npm test` | A single “fix the whole sheet” request with no phases |
| **Background agent** (if enabled) | Long **read-only** scans: duplicate SKU reports, diff sheets vs DB, CSV exports | **Direct rewrites** of production catalog or sheet data without a branch + review |
| **Review (e.g. Bugbot / PR review)** | After each phase: migration safety, unique constraints, broken imports, duplicate types, bad SQL | — |

**Reports-first workflow:** each phase should end with **artifacts** (CSVs, SQL that is reviewed, or a migration that only adds structure) before the next phase starts.

---

## Repo anchors (this codebase)

When scoping work, the agent should start from these areas:

- **DB:** `catalog_items`, `modifiers_v1`, `bundles_v1`, `bundle_items_v1` — see `supabase/migrations/0001_v1_baseline.sql` and `src/server/db/schema.ts`.
- **Sheets sync:** `src/server/services/googleSheetsCatalogSync.ts` (ITEMS / modifiers / bundles column aliases and merge behavior).
- **Catalog access:** `src/server/repos/catalogRepo.ts`, `src/types.ts` (`CatalogItem`), intake matching under `src/server/services/intake/`.
- **Import paths:** `src/server/importers/importCatalogCsv.ts`, `importCatalogAliasesCsv.ts`; scripts `scripts/import-div10-*.ts`.
- **Quality gate:** `npm run lint` (tsc), `npm test`, `npm run build`.

---

## Target end-state (five-tier model)

Align normalized storage with these concepts (names may map to your schema as `catalog_items` + new tables, not one flat sheet row per variant):

1. **Canonical items** — one row per true product line / orderable base.
2. **Decoupled attributes** — finish, material, mounting, size, compliance, etc.
3. **Parametric modifiers** — flat and percent material/labor, multipliers, category scope.
4. **Legacy / alias resolution** — old SKUs, vendor part numbers, parser phrases → canonical item (+ optional attribute bundle).
5. **Bundles / kits** — relational line items and/or consistent pipe-delimited representation with validation.

---

## Phase map

### Phase 1 — Audit only (no production mutations)

**Deliverable:** scripts + **CSV/JSON reports**; console summary by issue type.

**Suggested report filenames:**

- `catalog_audit_report.csv` (or one master + typed extracts below)
- `duplicate_sku_report.csv`
- `uom_anomaly_report.csv`
- `modifier_math_error_report.csv`
- `zero_cost_items_report.csv`
- `category_mapping_report.csv`
- `legacy_alias_candidates.csv`

**Out of scope:** changing sheet rows, bulk updating `catalog_items`, or altering estimate lines.

### Phase 2 — Normalize schema (additive)

**Goal:** tables/models for items, attributes, item–attribute links, modifiers (all cost fields you need), aliases, bundles, bundle lines, and validation issues — e.g. names like:

`catalog_items` (may already exist), new: `catalog_attributes`, `catalog_item_attributes`, `catalog_modifiers` or evolve `modifiers_v1`, `catalog_aliases`, `catalog_bundles`, `catalog_bundle_items`, `catalog_validation_issues`.

**Rules:** additive migrations first; do not break `catalogRepo` / takeoff / sync until compatibility shims or dual-read are defined.

### Phase 3 — Clean data types (scrub in staging or via migration with flags)

Currency strings → decimals; dates → typed columns; booleans; delimiter standard (e.g. `|`). **Flag** bad rows; do not silently delete.

### Phase 4 — Canonical item merge

Collapse duplicate variant rows into canonical items **only** with **alias table** coverage for every retired or merged SKU. Example pattern from your report: `BCS-SS`, `BCS-MB`, … → canonical `BCS` + attributes + modifiers + aliases.

### Phase 5 — CSI / MasterFormat (Division 10)

Map human categories to section codes, e.g.:

- Visual Display Boards → 10 11 00  
- Signage → 10 14 00  
- Toilet Partitions → 10 21 13  
- Wall Protection → 10 26 00  
- Washroom Accessories → 10 28 00  
- Fire Protection Specialties → 10 44 00  
- Lockers → 10 51 00  

(Store as data + validation; exact strings depend on your catalog vocabulary.)

### Phase 6 — Vendor enrichment

**After** structure is stable: manufacturer-specific metadata (Bobrick, Bradley, Scranton, ASI, Claridge, Florence, Larsen’s / FireMark, etc.). **Do not** enrich a still-flat, duplicated sheet—or you only enlarge the mess.

---

## Paste-ready prompts (run in order)

### Prompt A — Phase 1 (audit only)

```text
You are working on the Brighten Builders Division 10 estimating catalog cleanup in this repository (331 / 311).

Goal:
Turn the current flat, duplicate-heavy catalog/sheet structure into a safer normalized estimating catalog without breaking existing estimates, parser behavior, bundles, or proposal pricing.

Important:
Do NOT delete rows directly.
Do NOT overwrite existing SKUs without creating alias mappings.
Do NOT change pricing math until an audit report has been generated.
Do NOT collapse variants unless the old SKU/search term is preserved in the alias/resolution layer.
Do NOT make broad UI changes in this pass.

Context:
The catalog cleanup report identifies these problems:
1. Duplicate variant rows are being used as primary records.
2. Finish, mounting, size, material, and compliance variants should become attributes/modifiers instead of separate base catalog rows.
3. Legacy SKUs and vendor phrases need to map to canonical SKUs through an alias table.
4. Bundles/kits need normalized pipe-delimited SKU/modifier arrays or relational bundle item tables.
5. UOM is overused as EA and should be corrected, especially LF for wall protection and STALL/COMPARTMENT for toilet partitions.
6. Modifier math has errors where percent values are stored in flat add-cost fields.
7. Currency fields may contain strings, dollar signs, or commas.
8. CSI MasterFormat Division 10 mapping needs to be added to canonical catalog rows.
9. Zero-dollar tangible items should be flagged for review, not silently accepted.

Phase 1 only:
Create a non-destructive audit system.

Tasks:
1. Inspect the existing catalog, modifier, bundle, and sync/import code (e.g. src/server/services/googleSheetsCatalogSync.ts, src/server/repos/catalogRepo.ts, src/server/importers/, supabase/migrations, intake/takeoff catalog).
2. Identify the actual current schema and where catalog data is seeded, imported, synced, and used for estimates.
3. Add a script named something like scripts/catalog-audit.ts (or the appropriate project equivalent) wired with npm run script.
4. The script should generate reports (CSV under a folder like reports/catalog-audit/ or similar) for:
   - duplicate SKUs
   - duplicate generic names / likely duplicate canonical items
   - rows with variant words in SKU or description that should likely become attributes
   - zero or missing material cost for tangible products
   - invalid numeric/currency fields
   - inconsistent UOMs
   - modifier percent values stored in flat add-cost fields
   - inconsistent delimiters in modifier or bundle fields
   - missing CSI section codes
   - legacy/deprecated row candidates
   - bundle rows that reference unknown SKUs or modifiers
5. Add a validation issue type/table/file if one does not exist.
6. Do not mutate production data or Google Sheets in this phase.
7. Add clear console output showing counts by issue type.
8. Add a short README section (e.g. in docs/CURSOR_CATALOG_ACTION_PLAN.md or a dedicated docs/CATALOG_AUDIT.md) explaining how to run the audit and what each report means.
9. Run npm run lint, npm test, and npm run build if available.
10. Stop after producing the audit script and (optionally) sample run output documentation—not live data repair.

Output expected in your final message:
- List of files changed
- How to run the audit (exact npm command)
- Summary of issue categories
- Any schema or sheet column assumptions
```

### Prompt B — Phase 2 (schema only, no bulk data migration)

```text
Now implement Phase 2: normalized catalog structure.

Do not bulk-migrate or rewrite live production catalog data yet.

Create the normalized tables/models needed to support:
1. canonical catalog items
2. item attributes
3. item-to-attribute assignments
4. modifiers with separate flat material, flat labor, percent material, percent labor, and (if required) labor cost multiplier fields
5. aliases/resolution mappings from legacy SKUs, vendor SKUs, parser phrases, and generic names to canonical items
6. bundles and bundle line items
7. validation issues

Requirements:
- Preserve existing app behavior; existing catalog_items, sync, and takeoff code must not break.
- Add additive schema only unless absolutely necessary; use supabase/migrations/ and keep SQLite/PG duality in mind if both exist in this branch.
- Include TypeScript types or shared interfaces where this project uses them.
- Include seed examples (migration or dev seed) for:
  - Bobrick/B-6806 grab bar as canonical item
  - Bradley 812 grab bar as alias example
  - toilet partition material attribute examples
  - recessed/surface mounting modifiers
  - ADA restroom bundle example
- Add tests or validation functions proving old aliases can resolve to canonical items.
- Run npm run lint, npm test, npm run build.

Stop before bulk migrating the existing catalog from the sheet/DB.
```

### Prompt C — Phase 3 (proposed transformation only)

```text
Now implement Phase 3: safe catalog transformation proposal (no automatic apply to production).

Use the Phase 1 audit output to drive logic that generates review-only CSVs or a proposed migration SQL file that is not applied by default.

Create transformation logic that:
1. Groups likely duplicate catalog rows into canonical candidates.
2. Extracts variant terms from SKU/description into proposed attributes:
   finish, material, mounting, size, compliance, texture/grip, fire rating, tier/configuration
3. Generates alias mappings from old SKUs to proposed canonical SKUs.
4. Recommends UOM corrections: EA, LF, STALL/COMPARTMENT, SF as appropriate.
5. Flags any row where the transformation is low confidence.
6. Generates review files:
   - proposed_canonical_items.csv
   - proposed_attributes.csv
   - proposed_aliases.csv
   - proposed_modifier_fixes.csv
   - proposed_uom_fixes.csv
   - needs_human_review.csv

Rules:
- Do not apply destructive changes; do not delete legacy rows in scripts that run by default.
- Every old SKU must either remain active or map to a canonical item through aliases.
- If confidence is below 0.85, send the row to needs_human_review.
- Run npm run lint, npm test, npm run build.

Output: location of files, how to run the proposal generator, and a brief interpretation guide.
```

---

## Suggested order of operations for your team

1. Run **Prompt A** in Agent Mode; review CSVs; align on thresholds and false positives.  
2. Run **Prompt B**; get migrations and types reviewed; run tests.  
3. Run **Prompt C**; product owner reviews `needs_human_review.csv` and proposed merges.  
4. Only then: implement **Phase 3–4 execution** (scrub, merge, aliases) in small, reviewable PRs with re-run of audits after each.  
5. **Phase 5–6** after the catalog graph is stable.

This document is the **Cursor-facing action plan**; keep spreadsheet “cleanup” out of a single agent pass and treat each phase as mergeable, auditable work.
