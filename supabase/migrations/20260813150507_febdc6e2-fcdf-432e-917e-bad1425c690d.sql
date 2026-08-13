CREATE TABLE public.reviewer_auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reviewer_auth_attempts TO service_role;
ALTER TABLE public.reviewer_auth_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX reviewer_auth_attempts_created_idx ON public.reviewer_auth_attempts (created_at DESC);

CREATE TABLE public.reviewer_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reviewer_ai_usage TO service_role;
ALTER TABLE public.reviewer_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX reviewer_ai_usage_created_idx ON public.reviewer_ai_usage (created_at DESC);