DROP POLICY IF EXISTS ai_review_audit_select_admin ON public.ai_review_audit;
CREATE POLICY ai_review_audit_select_admin
  ON public.ai_review_audit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS ai_chat_usage_select_admin ON public.ai_chat_usage;
CREATE POLICY ai_chat_usage_select_admin
  ON public.ai_chat_usage FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.is_ai_unlimited(uuid) FROM authenticated, anon;