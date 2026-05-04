# Workbook cleanup findings (Excel / Sheets semantics)

## How production sync receives data (Google Sheets API)

**`syncCatalogFromGoogleSheets`** uses **`googleapis` `spreadsheets.values.get`** with range `TabName!A:ZZ`. Values arrive as **`string[][]`** (or cell scalars coerced by API). There is **no `xlsx` parse** on this path.

**`validateSheetRows`** (`googleSheetsCatalogSync.ts`):

- Trims every cell with `String(cell ?? '').trim()`.
- **Drops rows** where **every** cell is empty after trim (good for trailing blank rows; can hide “sparse” rows if all meaningful data is whitespace-only).

**Parsing helpers:**

- **`parseBoolean`:** explicit true/false tokens; **unknown → default** (often **true** when default `true` — e.g. active columns).
- **`parseNumber`:** strips commas, leading currency symbols; **non-numeric → default 0** (silent zeroing risk).
- **`splitList`:** splits on comma, semicolon, pipe, newline for tags / SKU lists / categories.

## Google Sheets–specific risks

| Issue | Risk | Mitigation |
| --- | --- | --- |
| **Plain TEXT vs numbers** | Values are often already strings; numbers may lack leading zeros on SKU if typed as number | Force **text** format for SKU columns; use leading apostrophe in Sheets where needed. |
| **Trailing empty columns** | API may omit trailing empties; row arrays vary in length | Code uses `String(row[index] ?? '')` — safe. |
| **Formula cells** | API returns **computed display** by default for simple reads; complex cases depend on Sheets behavior | Avoid volatile formulas on key columns without QA. |
| **Locale decimal separators** | `parseNumber` expects `.` decimal | Standardize workbook on US-style decimals or extend parser. |
| **Dates in “Active” / numeric columns** | Could stringify to unexpected tokens | Use explicit **TRUE/FALSE** for Active. |

## xlsx path (not used for Google sync)

Upload / intake paths (**`excelParser.ts`**, **`spreadsheetInterpreterService.ts`**) use **`xlsx`** with `raw: false` / `cellText` in some flows — different coercion rules (dates serial numbers, formatted strings). **Do not assume** those rules match live Sheets API sync. If operators **download Sheets to .xlsx** for offline QA, re-import may show **different** string forms than the API.

## Category / UOM inconsistency

- **Category** free text is stored as-is; **`category_main`** is **inferred** via `mapCategoryMain` — inconsistent wording still collapses to buckets, but typos can land in **`null` bucket**.
- **UOM** synonyms map to **EA, LF, SF, SET, HR, ALLOW**; anything else becomes **uppercased** (max length 12) — easy to accumulate **TYPO_UOM** codes.

## Malformed booleans

Strings outside the allowlist for **`parseBoolean`** fall back to the **default**. For **`active`**, default is often **true** — a typo like **`Flase`** may still import as **active**.

## Labor / money fields

- Omitted labor column → **0** minutes.
- Omitted material column with no matching header → **0** cost **with warning**.
- Attribute **percent** **0.1** → treated as **10%** with warning.

## Recommendations for workbook hygiene

1. Lock **header row**; use **Data validation** for Category, UOM, Active, Modifier keys where possible.
2. Keep **SKU** column as **plain text** everywhere.
3. Run **`npm run catalog:audit:supabase-phase`** after sync to Postgres for **duplicate / labor / alias** reports.
4. Treat **ITEMS** / research tabs as **non-publish** so experimental rows never enter `GOOGLE_SHEETS_TAB_ITEMS` in prod.

---

*See `sync_validation_rules.md` for the gate checklist.*
