REVOKE EXECUTE ON FUNCTION public.reserve_ai_review_credit(UUID) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_ai_review_credit(UUID) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.commit_ai_review_success(UUID) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_chat_recent_count(UUID) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_ai_review_credit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_review_credit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_ai_review_success(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_chat_recent_count(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_ai_unlimited(UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_ai_unlimited(UUID) TO authenticated, service_role;