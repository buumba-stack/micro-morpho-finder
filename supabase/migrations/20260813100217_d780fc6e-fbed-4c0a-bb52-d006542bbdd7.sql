ALTER TABLE public.particle_decisions
  ADD COLUMN IF NOT EXISTS contaminant_family_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS contaminant_family_name_snapshot text,
  ADD COLUMN IF NOT EXISTS contaminant_scope text,
  ADD COLUMN IF NOT EXISTS match_method text,
  ADD COLUMN IF NOT EXISTS matcher_version text,
  ADD COLUMN IF NOT EXISTS exclusion_reason text,
  ADD COLUMN IF NOT EXISTS procedural_blank_support integer;

ALTER TABLE public.particle_predictions
  ADD COLUMN IF NOT EXISTS contaminant_family_name_snapshot text;

ALTER TABLE public.contaminant_observations
  ADD COLUMN IF NOT EXISTS import_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS contaminant_observations_import_fingerprint_key
  ON public.contaminant_observations (user_id, import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;

ALTER TABLE public.particle_decisions
  DROP CONSTRAINT IF EXISTS particle_decisions_contaminant_family_id_fkey;
ALTER TABLE public.particle_decisions
  ADD CONSTRAINT particle_decisions_contaminant_family_id_fkey
  FOREIGN KEY (contaminant_family_id) REFERENCES public.contaminant_families(id) ON DELETE SET NULL;

ALTER TABLE public.particle_predictions
  DROP CONSTRAINT IF EXISTS particle_predictions_contaminant_family_id_fkey;
ALTER TABLE public.particle_predictions
  ADD CONSTRAINT particle_predictions_contaminant_family_id_fkey
  FOREIGN KEY (contaminant_family_id) REFERENCES public.contaminant_families(id) ON DELETE SET NULL;