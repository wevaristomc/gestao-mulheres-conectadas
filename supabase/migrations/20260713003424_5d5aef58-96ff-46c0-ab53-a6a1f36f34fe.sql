REVOKE EXECUTE ON FUNCTION public.has_role_any(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_project_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "projetos_admin_update" ON public.projetos;
DROP POLICY IF EXISTS "projetos_admin_insert" ON public.projetos;
DROP POLICY IF EXISTS "user_roles_own_or_admin_read" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;
DROP POLICY IF EXISTS "turmas_admin_manage" ON public.turmas;
DROP POLICY IF EXISTS "instrutor_turmas_own_or_admin_read" ON public.instrutor_turmas;
DROP POLICY IF EXISTS "instrutor_turmas_admin_manage" ON public.instrutor_turmas;

CREATE POLICY "user_roles_own_read" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "instrutor_turmas_own_read" ON public.instrutor_turmas
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "projetos_no_direct_insert" ON public.projetos
FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY "projetos_no_direct_update" ON public.projetos
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "turmas_no_direct_manage" ON public.turmas
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "instrutor_turmas_no_direct_manage" ON public.instrutor_turmas
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);