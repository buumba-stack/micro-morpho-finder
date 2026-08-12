-- roles
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'user');

CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_ai_unlimited(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$$;

-- AI Review credits
CREATE TABLE public.ai_review_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  credits_granted INTEGER NOT NULL DEFAULT 5,
  credits_remaining INTEGER NOT NULL DEFAULT 5,
  successful_reviews INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_review_credits TO authenticated;
GRANT ALL ON public.ai_review_credits TO service_role;
ALTER TABLE public.ai_review_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_review_credits_select_own" ON public.ai_review_credits FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- audit / usage ledgers
CREATE TABLE public.ai_review_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  charged BOOLEAN NOT NULL DEFAULT false,
  owner_exempt BOOLEAN NOT NULL DEFAULT false,
  remaining_after INTEGER,
  client_version TEXT,
  model TEXT,
  gateway_request_id TEXT,
  error_code TEXT
);
GRANT SELECT ON public.ai_review_audit TO authenticated;
GRANT ALL ON public.ai_review_audit TO service_role;
ALTER TABLE public.ai_review_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_review_audit_select_admin" ON public.ai_review_audit FOR SELECT TO authenticated USING (public.is_ai_unlimited(auth.uid()));

CREATE TABLE public.ai_chat_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  owner_exempt BOOLEAN NOT NULL DEFAULT false,
  client_version TEXT,
  model TEXT
);
CREATE INDEX ai_chat_usage_user_time_idx ON public.ai_chat_usage (user_id, created_at DESC);
GRANT SELECT ON public.ai_chat_usage TO authenticated;
GRANT ALL ON public.ai_chat_usage TO service_role;
ALTER TABLE public.ai_chat_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_chat_usage_select_admin" ON public.ai_chat_usage FOR SELECT TO authenticated USING (public.is_ai_unlimited(auth.uid()));

-- signup provisioning: profile, default role, 5 free AI Review credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.ai_review_credits (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- atomic credit reservation / release
CREATE OR REPLACE FUNCTION public.reserve_ai_review_credit(_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INTEGER;
BEGIN
  INSERT INTO public.ai_review_credits (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.ai_review_credits
     SET credits_remaining = credits_remaining - 1,
         updated_at = now()
   WHERE user_id = _user_id
     AND credits_remaining > 0
  RETURNING credits_remaining INTO remaining;

  RETURN remaining; -- NULL when no credit was available
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_review_credit(_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INTEGER;
BEGIN
  UPDATE public.ai_review_credits
     SET credits_remaining = LEAST(credits_remaining + 1, credits_granted),
         updated_at = now()
   WHERE user_id = _user_id
  RETURNING credits_remaining INTO remaining;

  RETURN remaining;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_ai_review_success(_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INTEGER;
BEGIN
  UPDATE public.ai_review_credits
     SET successful_reviews = successful_reviews + 1,
         updated_at = now()
   WHERE user_id = _user_id
  RETURNING credits_remaining INTO remaining;

  RETURN remaining;
END;
$$;

-- rolling 24h successful AI Chat count for a user
CREATE OR REPLACE FUNCTION public.ai_chat_recent_count(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.ai_chat_usage
   WHERE user_id = _user_id
     AND success
     AND created_at > now() - INTERVAL '24 hours'
$$;