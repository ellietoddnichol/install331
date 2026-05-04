# Schema and persistence coordination

Use this checklist when changing persisted fields (`projects_v1`, `takeoff_lines_v1`, `project_files_v1`, settings, catalog tables, etc.) so SQLite dev and Postgres/Supabase stay aligned.

## Order of operations

1. **Shared types** — Update [`src/shared/types/estimator.ts`](../src/shared/types/estimator.ts) (and intake types if the field originates there).
2. **SQLite** — Add `CREATE TABLE` baseline in [`src/server/db/schema.ts`](../src/server/db/schema.ts) for fresh installs, plus a defensive `PRAGMA table_info` + `ALTER TABLE` branch for existing databases.
3. **Postgres** — Add a migration under [`supabase/migrations/`](../supabase/migrations/) when the cloud schema must match.
4. **Repos** — Map snake_case columns ↔ camelCase in [`src/server/repos/`](../src/server/repos/) (`INSERT`/`UPDATE`/`SELECT` / `dbRun` helpers).
5. **API** — Expose fields on relevant `/api/v1/*` handlers if clients need them.
6. **Tests** — Same PR: a repo round-trip test or route test that exercises the new column (see [`docs/app-audit-and-roadmap.md`](./app-audit-and-roadmap.md) §5).

## PR description

Include a short **schema changelog**: one bullet per new/changed column (table, name, type, purpose).

## Naming

- Database: `snake_case`
- TypeScript records: `camelCase`
- Environment-driven feature flags (e.g. file storage): document in [`.env.example`](../.env.example)
