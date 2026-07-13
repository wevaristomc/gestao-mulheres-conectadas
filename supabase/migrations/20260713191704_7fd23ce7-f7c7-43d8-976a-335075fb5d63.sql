
-- Fix: projetos SELECT — restrict to members
DROP POLICY IF EXISTS projetos_authenticated_read ON public.projetos;
CREATE POLICY projetos_member_read ON public.projetos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND COALESCE(ur.ativo, true)
        AND (ur.projeto_id = projetos.id OR ur.projeto_id IS NULL)
    )
  );

-- Fix: turmas SELECT — members of the project; professor/auxiliar restricted to assigned turmas
DROP POLICY IF EXISTS turmas_authenticated_read ON public.turmas;
CREATE POLICY turmas_member_read ON public.turmas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND COALESCE(ur.ativo, true)
        AND (ur.projeto_id = turmas.projeto_id OR ur.projeto_id IS NULL)
        AND (
          ur.role::text NOT IN ('professor','auxiliar_pedagogico')
          OR EXISTS (
            SELECT 1 FROM public.instrutor_turmas it
            WHERE it.user_id = auth.uid() AND it.turma_id = turmas.id
          )
        )
    )
  );

-- Fix: permissoes_papel SELECT — restrict to admin/coordination roles
DROP POLICY IF EXISTS permissoes_papel_authenticated_read ON public.permissoes_papel;
CREATE POLICY permissoes_papel_admin_read ON public.permissoes_papel
  FOR SELECT TO authenticated
  USING (
    public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']
    )
  );

-- Fix: user_roles — explicit deny for client-side writes (privilege escalation prevention)
DROP POLICY IF EXISTS user_roles_no_client_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_no_client_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_no_client_delete ON public.user_roles;

CREATE POLICY user_roles_no_client_insert ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY user_roles_no_client_update ON public.user_roles
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY user_roles_no_client_delete ON public.user_roles
  FOR DELETE TO authenticated USING (false);

-- Fix: storage.objects 'documentos' bucket — enforce ownership on SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS documentos_select_auth ON storage.objects;
DROP POLICY IF EXISTS documentos_update_auth ON storage.objects;
DROP POLICY IF EXISTS documentos_delete_auth ON storage.objects;
DROP POLICY IF EXISTS documentos_select_owner_or_staff ON storage.objects;
DROP POLICY IF EXISTS documentos_update_owner_or_staff ON storage.objects;
DROP POLICY IF EXISTS documentos_delete_owner_or_staff ON storage.objects;

CREATE POLICY documentos_select_owner_or_staff ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      owner = auth.uid()
      OR public.has_role_any(
        auth.uid(),
        ARRAY['coordenador_geral','administrativo','coordenador_pedagogico','gestor_financeiro']
      )
    )
  );

CREATE POLICY documentos_update_owner_or_staff ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      owner = auth.uid()
      OR public.has_role_any(
        auth.uid(),
        ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']
      )
    )
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND (
      owner = auth.uid()
      OR public.has_role_any(
        auth.uid(),
        ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']
      )
    )
  );

CREATE POLICY documentos_delete_owner_or_staff ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      owner = auth.uid()
      OR public.has_role_any(
        auth.uid(),
        ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']
      )
    )
  );
