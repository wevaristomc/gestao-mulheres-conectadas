
-- 1. beneficiarias: restringir SELECT ------------------------------------------------
DROP POLICY IF EXISTS beneficiarias_read ON public.beneficiarias;
CREATE POLICY beneficiarias_read ON public.beneficiarias
  FOR SELECT TO authenticated
  USING (
    has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico','gestor_financeiro'])
    OR EXISTS (
      SELECT 1 FROM public.matriculas m
      JOIN public.instrutor_turmas it ON it.turma_id = m.turma_id
      WHERE m.beneficiaria_id = beneficiarias.id AND it.user_id = auth.uid()
    )
  );

-- 2. cursistas: restringir SELECT ----------------------------------------------------
DROP POLICY IF EXISTS cursistas_read ON public.cursistas;
CREATE POLICY cursistas_read ON public.cursistas
  FOR SELECT TO authenticated
  USING (
    has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico','gestor_financeiro'])
    OR EXISTS (
      SELECT 1 FROM public.matriculas m
      JOIN public.instrutor_turmas it ON it.turma_id = m.turma_id
      WHERE m.cursista_id = cursistas.id AND it.user_id = auth.uid()
    )
  );

-- 3. storage.objects: exigir ownership no INSERT do bucket documentos ---------------
DROP POLICY IF EXISTS documentos_insert_auth ON storage.objects;
CREATE POLICY documentos_insert_auth ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND owner = auth.uid()
  );

-- 4. ia_provedores: reduzir leitura/escrita a admin de topo -------------------------
DROP POLICY IF EXISTS "ia_provedores coord read" ON public.ia_provedores;
DROP POLICY IF EXISTS "ia_provedores coord write" ON public.ia_provedores;
CREATE POLICY "ia_provedores admin read" ON public.ia_provedores
  FOR SELECT TO authenticated
  USING (has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo']));
CREATE POLICY "ia_provedores admin write" ON public.ia_provedores
  FOR ALL TO authenticated
  USING (has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo']))
  WITH CHECK (has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo']));

-- 5. user_roles projeto_id IS NULL: só é global para coord_geral/administrativo -----
-- Reescreve políticas de leitura por projeto para exigir projeto_id casado, exceto
-- quando o papel é global (coord_geral/administrativo).

DROP POLICY IF EXISTS projetos_member_read ON public.projetos;
CREATE POLICY projetos_member_read ON public.projetos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.ativo, true)
      AND (
        ur.projeto_id = projetos.id
        OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo'))
      )
  ));

DROP POLICY IF EXISTS projetos_coord_update ON public.projetos;
CREATE POLICY projetos_coord_update ON public.projetos
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = 'coordenador_geral'
      AND (ur.projeto_id = projetos.id OR ur.projeto_id IS NULL)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = 'coordenador_geral'
      AND (ur.projeto_id = projetos.id OR ur.projeto_id IS NULL)
  ));

DROP POLICY IF EXISTS turmas_member_read ON public.turmas;
CREATE POLICY turmas_member_read ON public.turmas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.ativo, true)
      AND (
        ur.projeto_id = turmas.projeto_id
        OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo'))
      )
      AND (
        ur.role::text NOT IN ('professor','auxiliar_pedagogico')
        OR EXISTS (
          SELECT 1 FROM public.instrutor_turmas it
          WHERE it.user_id = auth.uid() AND it.turma_id = turmas.id
        )
      )
  ));

DROP POLICY IF EXISTS aulas_read ON public.aulas;
CREATE POLICY aulas_read ON public.aulas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.turmas t
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
        AND COALESCE(ur.ativo, true)
        AND (ur.projeto_id = t.projeto_id
             OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo')))
      WHERE t.id = aulas.turma_id
    )
    AND (
      NOT has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
      OR has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro'])
      OR EXISTS (
        SELECT 1 FROM public.instrutor_turmas it
        WHERE it.turma_id = aulas.turma_id AND it.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS matriculas_read ON public.matriculas;
CREATE POLICY matriculas_read ON public.matriculas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.turmas t
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
        AND COALESCE(ur.ativo, true)
        AND (ur.projeto_id = t.projeto_id
             OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo')))
      WHERE t.id = matriculas.turma_id
    )
    AND (
      NOT has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
      OR has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro'])
      OR EXISTS (
        SELECT 1 FROM public.instrutor_turmas it
        WHERE it.turma_id = matriculas.turma_id AND it.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS presencas_read ON public.presencas;
CREATE POLICY presencas_read ON public.presencas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.aulas a
    JOIN public.turmas t ON t.id = a.turma_id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
      AND COALESCE(ur.ativo, true)
      AND (ur.projeto_id = t.projeto_id
           OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo')))
    WHERE a.id = presencas.aula_id
      AND (
        NOT has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
        OR has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro'])
        OR EXISTS (
          SELECT 1 FROM public.instrutor_turmas it
          WHERE it.turma_id = a.turma_id AND it.user_id = auth.uid()
        )
      )
  ));

DROP POLICY IF EXISTS evidencias_read ON public.evidencias;
CREATE POLICY evidencias_read ON public.evidencias
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.turmas t
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
        AND COALESCE(ur.ativo, true)
        AND (ur.projeto_id = t.projeto_id
             OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo')))
      WHERE t.id = evidencias.turma_id
    )
    AND (
      NOT has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
      OR has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro'])
      OR EXISTS (
        SELECT 1 FROM public.instrutor_turmas it
        WHERE it.turma_id = evidencias.turma_id AND it.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS fornecedores_select_project_members ON public.fornecedores;
CREATE POLICY fornecedores_select_project_members ON public.fornecedores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.ativo, true)
      AND (
        ur.projeto_id = fornecedores.projeto_id
        OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo'))
      )
  ));

DROP POLICY IF EXISTS orcamento_itens_select_project_members ON public.orcamento_itens;
CREATE POLICY orcamento_itens_select_project_members ON public.orcamento_itens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.ativo, true)
      AND (
        ur.projeto_id = orcamento_itens.projeto_id
        OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo'))
      )
  ));

DROP POLICY IF EXISTS despesas_select_project_members ON public.despesas;
CREATE POLICY despesas_select_project_members ON public.despesas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.ativo, true)
      AND (
        ur.projeto_id = despesas.projeto_id
        OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo'))
      )
  ));

DROP POLICY IF EXISTS rubricas_select_project_members ON public.rubricas;
CREATE POLICY rubricas_select_project_members ON public.rubricas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.ativo, true)
      AND (
        ur.projeto_id = rubricas.projeto_id
        OR (ur.projeto_id IS NULL AND ur.role::text IN ('coordenador_geral','administrativo'))
      )
  ));

-- Também ajusta is_project_admin para tratar projeto_id NULL como global apenas
-- para coord_geral/administrativo.
CREATE OR REPLACE FUNCTION public.is_project_admin(_user_id uuid, _projeto_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico')
      AND COALESCE(ativo, true) = true
      AND (
        projeto_id = _projeto_id
        OR (projeto_id IS NULL AND role::text IN ('coordenador_geral','administrativo'))
      )
  )
$function$;
