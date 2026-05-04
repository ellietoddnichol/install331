# catalog_items.id collision — root cause & remediation

## Direct answers

| Question | Answer |
|----------|--------|
| Where does **`catalog_items.id`** come from on sheet sync? | **Never** copied from an “ID” column on CLEAN_ITEMS / ITEMS. Resolved in **`upsertItems`** in **`src/server/services/googleSheetsCatalogSync.ts`**: `id = existingRow?.id \|\| sheetDerivedId`, with `sheetDerivedId = \`sheet-item-${stableKey}\``. |
| Is it human-authored, generated, or mixed? | **Mixed:** (1) **Existing DB row** matched by SKU (case-insensitive), description+category, or existing PK = `sheetDerivedId` → reuse that **`id`**. (2) Otherwise **generated** deterministic string `sheet-item-${stableKey}`. |
| `stableKey` definition | **`sku`** (trimmed raw) **else** **`itemKey`** **else** **SHA1**(category + "|" + (item name or description)), 20-char hex (**`keyFromParts`**). Workbook **`Item ID`** / **`Item Key`** participates only via the **`itemKey`** column aliases — there is **no separate “catalog row pk” header** wired today. |
| Conflict target | Single statement **`INSERT INTO catalog_items ... ON CONFLICT(id) DO UPDATE SET ...`** (physical **`getCatalogItemsWriteTableName()`** → always **`catalog_items`**, never the `*_clean` view). |
| Duplicate ids inside one batch? | **Rare for same literal `stableKey`:** a **pass** records **last row wins** per `stableKey` (`lastOccurrenceRowIndexByStableKey`) before upsert so earlier duplicate keys are staged only. **Still possible:** two rows that differ only by **SKU letter case** produce **two different `stableKey` values** (map keys are case-sensitive) → **two processed rows** and **two different `sheet-item-*` ids** for the same commercial SKU. |
| Existing DB vs incoming | **Yes — collisions are possible** when (a) legacy row id does not match the current `sheetDerivedId` naming and lookups miss (mitigated by a third **`SELECT id WHERE id = sheetDerivedId`**) **or** (b) another code path inserts the same **`id`** without **`ON CONFLICT`** while sync runs (**less common**) **or** (c) **running older server code** without upsert semantics. |

## Likely failure modes (priority)

1. **SKU case duplicates in CLEAN_ITEMS**  
   Rows `FOO` vs `foo` → different `stableKey` strings → **two upserts**. Usually **UPSERT succeeds** unless second pass hits a path that **INSERTs duplicate PK without upsert**. Case-normalizing **`stableKey` (and `sheetDerivedId`) for SKU / Item Key-derived keys removes the dual-row pattern** (recommended code fix).

2. **Stale deployment / partial migration**  
   Any build where item upserts use **plain `INSERT`** triggers **`UNIQUE ... catalog_items.id`**. Confirm deployed bundle includes **`ON CONFLICT(id) DO UPDATE`** (same file as above).

3. **Concurrent non-upsert INSERT**  
   e.g. legacy REST **`POST /api/catalog/items`** uses plain insert (outside sync transaction). Timing with sync could collide on **chosen `id`** (operational rarity).

4. **Takeoff catalog seed (`ensureTakeoffCatalogSeeded`)**  
   SQLite path uses **`ON CONFLICT(id)`**. Skipped when **`isUsingCleanCatalogSource()`** is true (PG + `catalog_items_clean` reads). **Local SQLite** seeds can still race in theory — lower probability than workbook duplicates.

## Workbook-first: correct id strategy

| Approach | Recommendation |
|----------|------------------|
| Human-authored **`id`** in workbook | **Optional future column** `Catalog_Item_ID` / `RowID` mapped only if non-empty UNIQUE — avoids opaque `sheet-item-*`. **Requires** workbook discipline + strict preflight. |
| Stable derived **`id`** from canonical key | **Default today:** deterministic `sheet-item-${stableKey}`. Prefer **`normalized` canonical key** (`trim` + **`lower`** for SKU / item key portions) so governance doesn’t fracture on casing. |
| SKU-only derivation | Dangerous alone (same SKU, different manufactures) — estimator model already leans manufacturer + SKU in validation; workbook should carry **SKU + Manufacturer** before collapsing rows. |

**Minimum safe unblock (ops + code):**

- **Ops:** In **CLEAN_ITEMS**, merge duplicate SKUs differing only by case; reconcile **Item Key** duplicates.  
- **Code:** Implemented **`workbookCatalogStableSegment()`** in **`googleSheetsCatalogSync.ts`** — SKU and Item Key paths use **`trim` + lowercase** for **`stableKey`** / **`sheet-item-${stableKey}`**; hash-derived keys unchanged.

## Detective queries (SQLite / Postgres)

Duplicate **logical** SKU (case-sensitive vs insensitive):

```sql
-- Case-insensitive duplicate SKUs among active-ish sheet-style rows (example pattern)
SELECT lower(trim(sku)) AS k, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
FROM catalog_items
WHERE sku IS NOT NULL AND trim(sku) <> ''
GROUP BY lower(trim(sku))
HAVING COUNT(*) > 1;
```

PostgreSQL replace `GROUP_CONCAT` → `string_agg(id::text, '|')`.

Find **`sheet-item-`** prefixes **sharing** same lower SKU:

```sql
SELECT id, sku, canonical_sku, catalog_source_tab
FROM catalog_items
WHERE id LIKE 'sheet-item-%'
ORDER BY lower(sku), id;
```

## Exact assignment location

```
googleSheetsCatalogSync.ts → export async function upsertItems(...)
  ├── stableKey = sku || itemKey || keyFromParts(...)
  ├── sheetDerivedId = `sheet-item-${stableKey}`
  ├── existingRow := SELECT BY sku OR (description/category) OR id = sheetDerivedId
  ├── id = existingRow?.id || sheetDerivedId
  └── INSERT ... ON CONFLICT(id) DO UPDATE ...
```

Helper **keyFromParts** is defined in the same file (~L307).

## Safest non-destructive fixes (ordered)

1. **Deploy / verify** current **`ON CONFLICT(id)`** upsert is live.  
2. **Normalize SKU + Item Key casing** for **`stableKey`** / **`sheetDerivedId`** — **shipped:** `workbookCatalogStableSegment()` in **`googleSheetsCatalogSync.ts`**.  
3. **Workbook:** remove remaining case-duplicate SKUs; don’t hand-edit **`id`** in DB while Sheets is SOT.  
4. **Optional:** add preflight “computed id collision” scan for the batch (same normalized key from two incompatible rows alerts before transaction).

## Files changed / added (this investigation)

| File | Role |
|------|------|
| `reports/workbook-first-sync/id_collision_root_cause.md` | This document |
| `reports/workbook-first-sync/id_collision_candidates.sql` | Duplicate SKU SQL |
| `reports/workbook-first-sync/top_duplicate_sku_candidates_header.csv` | CSV header for query paste |
| `src/server/services/googleSheetsCatalogSync.ts` | **`workbookCatalogStableSegment()`** + **`upsertItems`** wiring |
| `src/server/services/googleSheetsCatalogSync.integration.test.ts` | Lowercase **`sheet-item-`** seed id |

## Files referencing this logic

| File | Role |
|------|------|
| **`src/server/services/googleSheetsCatalogSync.ts`** | **`upsertItems`**, **`keyFromParts`**, **`workbookCatalogStableSegment`**
| **`src/server/services/catalogSyncTransaction.ts`** | Transaction boundary for sync writes |
| **`src/server/db/catalogTable.ts`** | **`getCatalogItemsWriteTableName()`** |
| **`src/server/services/intake/takeoffCatalogRegistry.ts`** | Separate **`catalog_items`** upserts / seed |

---

## Duplicate / conflicting id report artifact

Concrete rows are environment-specific.

1. Export from DB: queries above saved as **`reports/workbook-first-sync/id_collision_candidates.sql`**.  
2. After fixing casing + re-sync: re-run queries; counts should drop.

See companion CSV template: **`top_duplicate_sku_candidates_header.csv`** (header-only; paste query results).

