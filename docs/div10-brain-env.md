# Div 10 Brain — environment variables

Div 10 Brain adds a **Supabase (Postgres + Storage + pgvector)** knowledge layer and **OpenAI** classification / retrieval / drafting. All ingestion, embeddings, and service-role access run **only on the Node server**. Pricing math stays in the existing estimator code paths.

## Required

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for Postgres + Storage (bypasses RLS) |
| `OPENAI_API_KEY` | OpenAI API key |
| `DIV10_BRAIN_ADMIN_SECRET` | Shared secret for `/api/v1/div10-brain/*` routes (send as `Authorization: Bearer <secret>` or header `x-div10-brain-admin-secret`) |

## Intake wiring (optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `INTAKE_DIV10_MAX_LINES` | `10` | Max estimate-review lines per parse to run Div 10 classify / retrieval / assist (cap 40). |

After `npm run import:div10-starter`, run ingestion for each `knowledge_documents` row once files exist in Storage (`manufacturer-docs` bucket paths from the manifest).

## Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Reserved if you later add user-scoped Supabase clients |
| `OPENAI_MODEL_CLASSIFY` | `gpt-4o-mini` | Model for classify / match / modifiers |
| `OPENAI_MODEL_DRAFT` | `gpt-4o-mini` | Model for proposal drafting |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embeddings (DB column is `vector(1536)`) |
| `APP_ENV` | `NODE_ENV` | Label only |

## Database

Apply the migration under `supabase/migrations/` (includes private storage bucket rows and `match_knowledge_chunks` RPC).

## Internal UI

After sign-in, open `/admin/div10-brain` and paste `DIV10_BRAIN_ADMIN_SECRET` to call the same APIs from the browser.

## CLI

- `npm run import:div10 -- catalog ./data/div10-brain/samples/catalog.csv`
- `npm run eval:div10`

