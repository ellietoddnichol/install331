# Deploy notes

## SQLite migrations (projects, takeoff, etc.)

On every process start, **`server.ts`** calls `initDb()` then **`initEstimatorSchema()`** from [`src/server/db/schema.ts`](../src/server/db/schema.ts). That function applies idempotent `ALTER TABLE ... ADD COLUMN` migrations when the SQLite schema is older than the code (for example `proposal_include_special_notes` on `projects_v1`).

**Production:** The same `tsx server.ts` (or `npm start`) entrypoint must run on Cloud Run (or your host) so existing databases pick up new columns before the v1 API reads or writes those fields.

## Secrets

Do not commit Google service account JSON or `gen-lang-client-*.json` (see `.gitignore`). Configure Cloud Run with environment variables or Secret Manager for Gemini and Sheets as needed.
