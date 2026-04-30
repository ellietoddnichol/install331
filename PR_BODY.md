This PR ports the low-risk foundation work from the integrated install331/Supabase line onto the current 311 main branch.

Included:
- Supabase/Postgres docs, migration scripts, and catalog audit tooling
- Supabase migrations
- PG dependencies and full test script
- DB driver/query/pgPool foundation
- Supabase browser/service clients
- requireSession helper
- PG/Supabase env docs
- Dockerfile stabilization for Cloud Run/build tooling
- Catalog normalization types, repo, and alias resolver

Not included yet:
- Full install331 repo/route/service migration
- Durable SQLite backup stack from install331
- Catalog normalization wiring into catalogRepo, Google Sheets sync, or takeoff registry
- Full parity with install331/main @ 0ba17ff
- Live Postgres end-to-end validation
- Browser UI smoke test for this reconciliation branch

Validation:
- npm run lint: pass
- npm test: 38 pass
- npm run build: pass
- DB_DRIVER=pg npm run lint: pass

Notes:
- This branch is intended as a foundation PR.
- It does not replace origin/main.
- No force-push was used.
