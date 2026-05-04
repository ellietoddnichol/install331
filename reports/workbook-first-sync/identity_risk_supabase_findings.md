# Identity risk audit — Supabase / published DB (findings note)

**Date:** 2026-05-04  
**Command:** `npm run catalog:audit:identity-mfr-sku` with `DB_DRIVER=pg` (Postgres driver). Script also loads `.env` then `.env.local` via dotenv (`override: false`).

## Connection outcome

The run attempted **`catalog_items`** using the pooled Node `pg` client (`src/server/db/query.ts`). **PostgreSQL connectivity did not succeed** before the analytics queries executed.

- **Error class:** `getaddrinfo ENOTFOUND`
- **Observed hostname in error:** `base` — consistent with **`DATABASE_URL` in `.env` not being a valid Postgres URI** (metadata-only check: length 12, invalid URL parsing).
- **`.env.local`:** no `DATABASE_URL` line detected.
- **`.env.recover.txt`:** no `DATABASE_URL=` line detected (recovery file cannot supply the wire URI in this checkout).

### What is missing for a real Supabase/PG run

Per `.env.example` and `scripts/identity-risk-mfr-sku-audit.ts`:

- **`DB_DRIVER=pg`** (set explicitly at shell if not in `.env`, because default driver is SQLite).
- **`DATABASE_URL`** set to your Supabase **Transaction pooler** URI (`postgresql://...pooler.supabase.com:6543/...`) including `sslmode=require` (and **`pgbouncer=true`** where required).

Do **not** commit `.env`; keep the URI outside git.

---

## Metrics from this attempted run

Because both SQL legs failed early, **`dbAll` returned no detail rows.** The emitted artifacts reflect **_query failure + empty collision sets**, **not** a verified empty production catalog.

| Metric | Scripted value | Interpretation |
|--------|----------------|----------------|
| Rows (manufacturer + SKU collision detail) | 0 | **Not authoritative** |
| Distinct normalized SKUs (manufacturer collision) | 0 | **Not authoritative** |
| Rows (category divergence excluding mfr-collision SKUs) | 0 | **Not authoritative** |
| Distinct normalized SKUs (category-only divergence) | 0 | **Not authoritative** |
| `priority_source` in `identity_risk_remediation_queue.csv` | 1 placeholder row (`n/a`, `future_preflight_hardening`, `no_rows_from_db`) | No **CLEAN_ITEMS_workbook_first** vs other breakdown available |

Published collision summary timestamps and zero counts appear in:

- `reports/workbook-first-sync/manufacturer_sku_collision_summary.md`

---

## Top patterns / sample SKUs

**None.** No SKU-level remediation rows materialized against live data.

---

## Next action

Fix `DATABASE_URL` (pooler URI) and **`DB_DRIVER=pg`**, then re-run:

`npm run catalog:audit:identity-mfr-sku`

Refresh this note and `recommended_id_hardening_decision.md` using the regenerated CSV counts.
