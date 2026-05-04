# Catalog manual review workflow (sync audit queues)

Operators resolve workbook-first catalog sync findings using **Catalog → Sync publish review → Manual review queues** plus optional **CSV exports** from the API.

## When to use this

- After **Google Sheets catalog sync** (Settings or background auto-sync).
- When **preflight blocked** sync (`catalog_sync_status_v1.status = failed`) — blocking lines appear in the status message and are folded into exports where patterns match.
- When sync **succeeds with warnings** — non-blocking lines (for example suspicious labor minutes, unknown bundle modifiers) remain in `warnings_json`.

## Operator steps

1. Open **Catalog** and expand **Sync publish review**.
2. Scan **Manual review queues** — each queue shows a short **preview table** (first rows) and a **Download CSV** button.
3. Use **Open in Catalog / Search** links where a SKU or modifier token was detected; URLs use **`/catalog?q=<token>`** (search filters items/modifiers/bundles client-side).
4. Fix issues **in the workbook first** (ITEMS, BUNDLES, ALIASES, ATTRIBUTES tabs), then **re-run sync** from Settings. DB edits are secondary except where you intentionally patch catalog rows outside the sheet.

### CSV export (API)

- **GET** `/api/v1/settings/catalog-sync-review-csv?queue=<queue>&runId=<optional>`
- **`queue`** (required): `duplicate_sku_groups` | `alias_collisions` | `labor_outliers` | `orphan_bundle_skus` | `unknown_modifiers` | `orphan_attribute_skus` | `orphan_alias_skus`
- **`runId`**: UUID of a row in `catalog_sync_runs_v1`. Omit to use the **latest run** by `attempted_at`.
- **404**: No run row, or **no rows** after filtering that queue (plain text body).

The Catalog UI passes **`runId`** when `latestCatalogSyncRunId` is present on sync status (same ordering as historical workbook context).

## CSV columns

| Column | Meaning |
|--------|---------|
| `run_id` | Sync run UUID (`catalog_sync_runs_v1.id`). |
| `attempted_at` | ISO timestamp for that run. |
| `spreadsheet_id` | From parsed `run_context_json` when present; else empty. |
| `items_fetch_tab` | Items tab **actually read** for that run (`tabs.itemsFetch`). |
| `queue` | Queue key (matches `queue` query param). |
| `detail` | Full warning/blocking/sample line used for review. |
| `primary_search_token` | Best-effort extracted SKU / modifier / alias fragment for lookup. |
| `catalog_search_path` | Relative app path e.g. `/catalog?q=SKU` (empty token → `/catalog`). |

## Resolution hints by queue

| Queue | Typical cause | Fix |
|-------|----------------|-----|
| **duplicate_sku_groups** | Same normalized SKU with conflicting description/material/labor | ITEMS tab: consolidate rows or correct SKU / economics so only one canonical row survives preflight. |
| **alias_collisions** | Same alias key maps to multiple canonical SKUs | ALIASES tab: split alias types/values or align canonical targets. |
| **labor_outliers** | Heuristic labor minutes vs category/description | ITEMS tab: adjust minutes or inactive flag; verify partition/heavy-item assumptions. |
| **orphan_bundle_skus** | Bundle references SKU not on ITEMS sheet / catalog universe | ITEMS or BUNDLES: add SKU row or correct bundle token. |
| **unknown_modifiers** | Modifier token not in modifiers sheet / DB keys | MODIFIERS tab: add key or fix bundle reference spelling/canonicalization. |
| **orphan_attribute_skus** | ATTRIBUTE rows point at missing canonical SKU | ITEMS or ATTRIBUTES: add SKU or fix `Canonical_SKU`. |
| **orphan_alias_skus** | ALIAS rows point at missing canonical SKU | ITEMS or ALIASES: add SKU or fix `Canonical_SKU`. |

## Limits / caveats

- Preflight **blocking lines are capped** per run (`CATALOG_SYNC_PREFLIGHT_MAX_BLOCKING`); very large duplicate-group lists may be truncated in the **stored failure message**, while CSV still uses **full classified lines** present in `warnings_json` plus audit samples when needed.
- **`catalogReview` samples** are capped (`CATALOG_SYNC_REVIEW_MAX_SAMPLES`); CSV falls back to audit samples only when **no** classified lines exist for that queue.
