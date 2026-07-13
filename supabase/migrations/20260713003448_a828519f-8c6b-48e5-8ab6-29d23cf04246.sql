DROP POLICY IF EXISTS "auth users manage importacoes_presenca" ON public.importacoes_presenca;
DROP POLICY IF EXISTS "importacoes_presenca_restricted_read" ON public.importacoes_presenca;
DROP POLICY IF EXISTS "importacoes_presenca_restricted_insert" ON public.importacoes_presenca;
DROP POLICY IF EXISTS "importacoes_presenca_restricted_update" ON public.importacoes_presenca;
DROP POLICY IF EXISTS "importacoes_presenca_restricted_delete" ON public.importacoes_presenca;

CREATE POLICY "importacoes_presenca_restricted_read" ON public.importacoes_presenca
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico')
  )
  OR EXISTS (
    SELECT 1
    FROM public.instrutor_turmas it
    WHERE it.user_id = auth.uid()
      AND it.turma_id = importacoes_presenca.turma_id
  )
);

CREATE POLICY "importacoes_presenca_restricted_insert" ON public.importacoes_presenca
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico')
  )
  OR EXISTS (
    SELECT 1
    FROM public.instrutor_turmas it
    WHERE it.user_id = auth.uid()
      AND it.turma_id = importacoes_presenca.turma_id
  )
);

CREATE POLICY "importacoes_presenca_restricted_update" ON public.importacoes_presenca
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico')
  )
);

CREATE POLICY "importacoes_presenca_restricted_delete" ON public.importacoes_presenca
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('coordenador_geral','administrativo')
  )
);