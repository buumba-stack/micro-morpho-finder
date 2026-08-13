-- 1. analysis_batches
CREATE TABLE public.analysis_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  analysis_date DATE,
  tissue TEXT,
  protocol TEXT,
  solution TEXT,
  microscope TEXT,
  objective TEXT,
  acquisition_profile TEXT,
  um_per_px DOUBLE PRECISION,
  threshold INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_batches TO authenticated;
GRANT ALL ON public.analysis_batches TO service_role;
ALTER TABLE public.analysis_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analysis_batches_own" ON public.analysis_batches
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX analysis_batches_user_idx ON public.analysis_batches (user_id, created_at DESC);

-- 2. contaminant_families
CREATE TABLE public.contaminant_families (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contaminant_type TEXT NOT NULL DEFAULT 'other_contaminant',
  scope TEXT NOT NULL DEFAULT 'batch',
  batch_id UUID REFERENCES public.analysis_batches(id) ON DELETE SET NULL,
  tissue TEXT,
  protocol TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contaminant_families TO authenticated;
GRANT ALL ON public.contaminant_families TO service_role;
ALTER TABLE public.contaminant_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contaminant_families_own" ON public.contaminant_families
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX contaminant_families_user_idx ON public.contaminant_families (user_id, scope, status);
CREATE INDEX contaminant_families_batch_idx ON public.contaminant_families (batch_id);

-- 3. contaminant_observations
CREATE TABLE public.contaminant_observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.contaminant_families(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.analysis_batches(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'sample_image',
  particle_id TEXT,
  source_image_id TEXT,
  source_image_name TEXT,
  tissue TEXT,
  protocol TEXT,
  particle_features JSONB NOT NULL DEFAULT '{}'::jsonb,
  manually_confirmed BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contaminant_observations TO authenticated;
GRANT ALL ON public.contaminant_observations TO service_role;
ALTER TABLE public.contaminant_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contaminant_observations_own" ON public.contaminant_observations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX contaminant_observations_family_idx ON public.contaminant_observations (family_id);
CREATE INDEX contaminant_observations_user_idx ON public.contaminant_observations (user_id, created_at DESC);

-- 4. particle_decisions (human-confirmed truth, incl. negative feedback)
CREATE TABLE public.particle_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.analysis_batches(id) ON DELETE SET NULL,
  particle_id TEXT,
  source_image_id TEXT,
  source_image_name TEXT,
  contaminant_family_id UUID REFERENCES public.contaminant_families(id) ON DELETE SET NULL,
  proposed_prediction TEXT,
  proposed_confidence DOUBLE PRECISION,
  decision TEXT NOT NULL,
  decision_source TEXT NOT NULL DEFAULT 'manual_review',
  particle_features JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.particle_decisions TO authenticated;
GRANT ALL ON public.particle_decisions TO service_role;
ALTER TABLE public.particle_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "particle_decisions_own" ON public.particle_decisions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX particle_decisions_user_idx ON public.particle_decisions (user_id, created_at DESC);
CREATE INDEX particle_decisions_batch_idx ON public.particle_decisions (batch_id);

-- 5. particle_predictions (advisory only, never training truth)
CREATE TABLE public.particle_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.analysis_batches(id) ON DELETE SET NULL,
  particle_id TEXT,
  source_image_id TEXT,
  source_image_name TEXT,
  method TEXT NOT NULL DEFAULT 'blank_matcher',
  prediction TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  contaminant_family_id UUID REFERENCES public.contaminant_families(id) ON DELETE SET NULL,
  model_version TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.particle_predictions TO authenticated;
GRANT ALL ON public.particle_predictions TO service_role;
ALTER TABLE public.particle_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "particle_predictions_own" ON public.particle_predictions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX particle_predictions_user_idx ON public.particle_predictions (user_id, created_at DESC);
CREATE INDEX particle_predictions_batch_idx ON public.particle_predictions (batch_id);

-- updated_at triggers (function already exists in some projects; keep idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER analysis_batches_updated_at BEFORE UPDATE ON public.analysis_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER contaminant_families_updated_at BEFORE UPDATE ON public.contaminant_families
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();