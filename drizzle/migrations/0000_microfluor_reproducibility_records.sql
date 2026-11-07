CREATE TABLE public.image_analysis_records (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 batch_id uuid,
 image_name text NOT NULL,
 image_sha256 text NOT NULL,
 run_id text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL,
 UNIQUE(user_id, run_id, image_sha256)
);
GRANT SELECT, INSERT, UPDATE ON public.image_analysis_records TO authenticated;
GRANT ALL ON public.image_analysis_records TO service_role;
ALTER TABLE public.image_analysis_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_records_select ON public.image_analysis_records FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY image_records_insert ON public.image_analysis_records FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY image_records_update ON public.image_analysis_records FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX image_records_user_batch ON public.image_analysis_records(user_id, batch_id, recorded_at);
COMMENT ON TABLE public.image_analysis_records IS 'Durable per-image run snapshots, independent of workspace clearing; existing batch rows are not modified.';
CREATE TABLE public.analysis_library_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 content_hash text NOT NULL,
 storage_path text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, content_hash)
);
GRANT SELECT, INSERT ON public.analysis_library_versions TO authenticated;
GRANT ALL ON public.analysis_library_versions TO service_role;
ALTER TABLE public.analysis_library_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY library_versions_select ON public.analysis_library_versions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY library_versions_insert ON public.analysis_library_versions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());