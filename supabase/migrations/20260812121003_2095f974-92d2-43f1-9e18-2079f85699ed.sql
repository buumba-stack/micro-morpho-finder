INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::app_role FROM auth.users WHERE email = 'buumbamudenda52@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.ai_review_credits c
SET credits_remaining = c.credits_granted, updated_at = now()
WHERE c.user_id IN (SELECT id FROM auth.users WHERE email = 'buumbamudenda52@gmail.com');