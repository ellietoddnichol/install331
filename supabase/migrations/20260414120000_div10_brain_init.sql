-- Div 10 Brain: structured knowledge + vectors + AI audit (Postgres / Supabase)
-- Run via Supabase CLI or SQL editor. Does not touch the app SQLite estimator DB.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- catalog_items (Supabase truth layer — not the SQLite catalog_items table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  brand text NOT NULL,
  category text NOT NULL,
  subcategory text,
  normalized_name text NOT NULL,
  description text,
  finish text,
  material text,
  mounting text,
  install_minutes numeric,
  unit text,
  active boolean NOT NULL DEFAULT true,
  source_file_path text,
  source_row_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_items_sku_idx ON public.catalog_items (sku);
CREATE INDEX IF NOT EXISTS catalog_items_brand_idx ON public.catalog_items (brand);
CREATE INDEX IF NOT EXISTS catalog_items_category_idx ON public.catalog_items (category);
CREATE INDEX IF NOT EXISTS catalog_items_subcategory_idx ON public.catalog_items (subcategory);
CREATE INDEX IF NOT EXISTS catalog_items_active_idx ON public.catalog_items (active);

CREATE TABLE IF NOT EXISTS public.catalog_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items (id) ON DELETE CASCADE,
  alias_text text NOT NULL,
  alias_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_aliases_alias_text_idx ON public.catalog_aliases (alias_text);
CREATE INDEX IF NOT EXISTS catalog_aliases_catalog_item_id_idx ON public.catalog_aliases (catalog_item_id);

CREATE TABLE IF NOT EXISTS public.modifier_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_key text NOT NULL UNIQUE,
  label text NOT NULL,
  applies_to_categories text[],
  applies_to_conditions text[],
  pricing_effect_type text,
  default_value numeric,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bundle_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_name text NOT NULL,
  category text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bundle_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_template_id uuid NOT NULL REFERENCES public.bundle_templates (id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.catalog_items (id),
  quantity numeric NOT NULL,
  required boolean NOT NULL DEFAULT true,
  modifier_defaults jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bundle_template_items_bundle_id_idx ON public.bundle_template_items (bundle_template_id);

CREATE TABLE IF NOT EXISTS public.proposal_clauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_type text NOT NULL,
  title text,
  body text NOT NULL,
  applicable_categories text[],
  applicable_conditions text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  doc_type text NOT NULL,
  title text,
  source_kind text,
  brand text,
  category text,
  subcategory text,
  project_type text,
  active boolean NOT NULL DEFAULT true,
  checksum text,
  ingestion_status text NOT NULL DEFAULT 'pending',
  ingestion_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx ON public.knowledge_documents (ingestion_status);
CREATE INDEX IF NOT EXISTS knowledge_documents_doc_type_idx ON public.knowledge_documents (doc_type);

-- OpenAI text-embedding-3-small dimension
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_document_id uuid NOT NULL REFERENCES public.knowledge_documents (id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  chunk_text text NOT NULL,
  chunk_title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (knowledge_document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_id_idx ON public.knowledge_chunks (knowledge_document_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_metadata_gin ON public.knowledge_chunks USING gin (metadata);

-- IVFFLAT or HNSW — HNSW preferred on Supabase PG15+
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
  ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS public.estimate_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id uuid,
  raw_line_text text NOT NULL,
  normalized_line_text text,
  section_context text,
  project_context jsonb,
  chosen_catalog_item_id uuid REFERENCES public.catalog_items (id),
  accepted_modifiers text[],
  review_outcome text,
  estimator_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  input_json jsonb NOT NULL,
  output_json jsonb NOT NULL,
  quality_score numeric,
  approved boolean NOT NULL DEFAULT false,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  model text NOT NULL,
  input_payload jsonb NOT NULL,
  retrieved_context jsonb,
  output_payload jsonb,
  final_decision jsonb,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_run_logs_task_type_idx ON public.ai_run_logs (task_type);
CREATE INDEX IF NOT EXISTS ai_run_logs_created_idx ON public.ai_run_logs (created_at DESC);

-- RLS: default deny for JWT roles; service_role bypasses RLS in Supabase.
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_run_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Storage buckets (private). Use Storage API from server with service role.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('manufacturer-docs', 'manufacturer-docs', false),
  ('install-guides', 'install-guides', false),
  ('past-proposals', 'past-proposals', false),
  ('past-takeoffs', 'past-takeoffs', false),
  ('internal-playbooks', 'internal-playbooks', false),
  ('project-uploads', 'project-uploads', false),
  ('training-exports', 'training-exports', false)
ON CONFLICT (id) DO NOTHING;

-- Semantic search helper (cosine distance via pgvector operator <=>)
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 12,
  filter_doc_type text DEFAULT NULL,
  filter_category text DEFAULT NULL,
  filter_brand text DEFAULT NULL,
  filter_active boolean DEFAULT true
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  chunk_text text,
  chunk_title text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    kc.id AS chunk_id,
    kc.knowledge_document_id AS document_id,
    kc.chunk_text,
    kc.chunk_title,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  INNER JOIN public.knowledge_documents kd ON kd.id = kc.knowledge_document_id
  WHERE kc.embedding IS NOT NULL
    AND kd.active IS NOT DISTINCT FROM filter_active
    AND (filter_doc_type IS NULL OR kd.doc_type = filter_doc_type)
    AND (filter_category IS NULL OR kd.category = filter_category)
    AND (filter_brand IS NULL OR kd.brand = filter_brand)
  ORDER BY kc.embedding <=> query_embedding
  LIMIT greatest(1, least(match_count, 100));
$$;
