
-- Add staff-write RLS policies for turmas, instrutor_turmas, permissoes_papel

DROP POLICY IF EXISTS turmas_no_direct_manage ON public.turmas;
CREATE POLICY turmas_staff_insert ON public.turmas FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico'])
  );
CREATE POLICY turmas_staff_update ON public.turmas FOR UPDATE TO authenticated
  USING (
    public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico'])
  )
  WITH CHECK (
    public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico'])
  );
CREATE POLICY turmas_staff_delete ON public.turmas FOR DELETE TO authenticated
  USING (
    public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo'])
  );

DROP POLICY IF EXISTS instrutor_turmas_no_direct_manage ON public.instrutor_turmas;
CREATE POLICY instrutor_turmas_staff_insert ON public.instrutor_turmas FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico'])
  );
CREATE POLICY instrutor_turmas_staff_update ON public.instrutor_turmas FOR UPDATE TO authenticated
  USING (
    public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico'])
  )
  WITH CHECK (
    public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico'])
  );
CREATE POLICY instrutor_turmas_staff_delete ON public.instrutor_turmas FOR DELETE TO authenticated
  USING (
    public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico'])
  );

CREATE POLICY permissoes_papel_coord_insert ON public.permissoes_papel FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coordenador_geral'::app_role));
CREATE POLICY permissoes_papel_coord_update ON public.permissoes_papel FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coordenador_geral'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'coordenador_geral'::app_role));
CREATE POLICY permissoes_papel_coord_delete ON public.permissoes_papel FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'coordenador_geral'::app_role));
