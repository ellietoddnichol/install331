# Review queue persistence — recommendation

Today, catalog sync review queues are **derived**: the server classifies lines from `warnings_json` (+ blocking text folded into the sync attempt **message**) and optional **`audit.catalogReview`** samples. **No authoritative “reviewed” state** is stored in this pass.

## Options compared

### A. Run-scoped UI only (current + optional `localStorage`)

- **Pros:** Zero schema; no migration; safe for workbook-first truth.
- **Cons:** Ack/dismiss state is **non-authoritative**, per-browser, easy to lose.

Optional pattern (not implemented by default):

`catalogReviewAck:${runId}:${queue}` → `"1"` meaning “team skimmed this queue for this run.”

Use only as a personal checklist — never gate automation on it.

### B. Piggyback `estimator_catalog_validation_issues` (if/when present)

- **Pros:** Single validation-store narrative if issues already keyed by SKU/category.
- **Cons:** Sync-run queues are **event-sourced from sheets**, not necessarily the same lifecycle as estimator validation rows; coupling risks stale semantics unless issue types map 1:1.

**Recommendation:** Only merge if product owns a unified “validation issue” taxonomy; otherwise keep sync review separate.

### C. New table `catalog_review_status_v1`

Suggested columns (conceptual):

- `run_id` (FK-style UUID to `catalog_sync_runs_v1.id`)
- `queue` (text enum)
- `issue_fingerprint` (hash of normalized `detail` line or structured keys)
- `status` (`open` | `waived` | `resolved_workbook` | `resolved_db`)
- `updated_at`, `updated_by`

- **Pros:** Durable workflow; audit trail; optional RPC for dashboards.
- **Cons:** Schema + RLS/auth surface + definitions of “resolved.”

## Phased approach

1. **Phase 1 (done):** Derived queues + CSV export + Catalog preview — operators fix workbook and re-sync.
2. **Phase 2:** Optional **`localStorage`** acknowledgements or **comment-only** notes file-side — still non-authoritative.
3. **Phase 3:** If teams need compliance tracking, add **`catalog_review_status_v1`** keyed by **`run_id` + fingerprint**, not global SKU — avoids conflicting with workbook-first edits across runs.

Workbook-first principle: **closing** an issue should mean **sheet corrected + sync green**, not muting the warning in DB alone.
