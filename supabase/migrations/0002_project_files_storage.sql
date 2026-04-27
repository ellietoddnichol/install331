-- Optional object storage pointer for project uploads (Supabase Storage).
-- When storage_object_key is set, the API prefers Storage over data_base64.

ALTER TABLE project_files_v1 ADD COLUMN IF NOT EXISTS storage_object_key TEXT;

-- Allow rows that only have a storage key (post-migration cleanup can drop data_base64 later).
ALTER TABLE project_files_v1 ALTER COLUMN data_base64 DROP NOT NULL;
