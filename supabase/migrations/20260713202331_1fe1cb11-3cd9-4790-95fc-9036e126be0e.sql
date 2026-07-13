
-- =====================================================================
-- Pedagógico/MTE — tabelas base ausentes + colunas faltantes em turmas
-- =====================================================================

-- Trigger utilitário (idempotente)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------------------------------------------------------------------
-- turmas: completa colunas esperadas pelo app
-- ---------------------------------------------------------------------
ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS instrumento_id uuid,
  ADD COLUMN IF NOT EXISTS executora text,
  ADD COLUMN IF NOT EXISTS nome_curso text,
  ADD COLUMN IF NOT EXISTS ch_conhecimentos_gerais integer,
  ADD COLUMN IF NOT EXISTS ch_conhecimentos_especificos integer,
  ADD COLUMN IF NOT EXISTS ch_total integer,
  ADD COLUMN IF NOT EXISTS qtd_dias_curso integer,
  ADD COLUMN IF NOT EXISTS dias_semana text,
  ADD COLUMN IF NOT EXISTS vagas integer,
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date,
  ADD COLUMN IF NOT EXISTS local_endereco text,
  ADD COLUMN IF NOT EXISTS local_id uuid,
  ADD COLUMN IF NOT EXISTS contato_local_nome text,
  ADD COLUMN IF NOT EXISTS contato_local_telefone text,
  ADD COLUMN IF NOT EXISTS ciclo integer,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------
-- beneficiarias
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beneficiarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text,
  data_nascimento date,
  genero text,
  raca text,
  pcd boolean DEFAULT false,
  tipo_deficiencia text,
  telefone text,
  email text,
  endereco text,
  municipio text,
  nis text,
  beneficiaria_programa_social boolean DEFAULT false,
  qual_programa_social text,
  banco text,
  agencia text,
  conta text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficiarias_cpf_uidx
  ON public.beneficiarias (cpf) WHERE cpf IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiarias TO authenticated;
GRANT ALL ON public.beneficiarias TO service_role;
ALTER TABLE public.beneficiarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beneficiarias_read" ON public.beneficiarias;
CREATE POLICY "beneficiarias_read" ON public.beneficiarias FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid() AND COALESCE(ur.ativo, true) = true));
DROP POLICY IF EXISTS "beneficiarias_write_admin" ON public.beneficiarias;
CREATE POLICY "beneficiarias_write_admin" ON public.beneficiarias FOR ALL TO authenticated
  USING (public.has_role_any(auth.uid(),
    ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro']))
  WITH CHECK (public.has_role_any(auth.uid(),
    ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro']));

DROP TRIGGER IF EXISTS trg_beneficiarias_updated_at ON public.beneficiarias;
CREATE TRIGGER trg_beneficiarias_updated_at BEFORE UPDATE ON public.beneficiarias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- cursistas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cursistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text,
  email text,
  telefone text,
  municipio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cursistas_cpf_uidx
  ON public.cursistas ((regexp_replace(coalesce(cpf,''), '\D', '', 'g')))
  WHERE cpf IS NOT NULL AND cpf <> '';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cursistas TO authenticated;
GRANT ALL ON public.cursistas TO service_role;
ALTER TABLE public.cursistas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cursistas_read" ON public.cursistas;
CREATE POLICY "cursistas_read" ON public.cursistas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid() AND COALESCE(ur.ativo, true) = true));
DROP POLICY IF EXISTS "cursistas_write_admin" ON public.cursistas;
CREATE POLICY "cursistas_write_admin" ON public.cursistas FOR ALL TO authenticated
  USING (public.has_role_any(auth.uid(),
    ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro',
          'professor','auxiliar_pedagogico']))
  WITH CHECK (public.has_role_any(auth.uid(),
    ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro',
          'professor','auxiliar_pedagogico']));

DROP TRIGGER IF EXISTS trg_cursistas_updated_at ON public.cursistas;
CREATE TRIGGER trg_cursistas_updated_at BEFORE UPDATE ON public.cursistas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- aulas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  data date,
  hora_inicio time,
  hora_fim time,
  ch_prevista numeric,
  ch_ministrada numeric,
  duracao numeric,
  ch numeric,
  tipo_ch text,
  titulo text,
  tema text,
  assunto text,
  conteudo text,
  conteudo_programatico text,
  instrutor text,
  ordem integer,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aulas_turma_idx ON public.aulas(turma_id);
CREATE INDEX IF NOT EXISTS aulas_data_idx ON public.aulas(data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aulas TO authenticated;
GRANT ALL ON public.aulas TO service_role;
ALTER TABLE public.aulas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aulas_read" ON public.aulas;
CREATE POLICY "aulas_read" ON public.aulas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.turmas t
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
        AND (ur.projeto_id = t.projeto_id OR ur.projeto_id IS NULL)
        AND COALESCE(ur.ativo,true) = true
      WHERE t.id = aulas.turma_id
    )
    AND (
      NOT public.has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
      OR public.has_role_any(auth.uid(),
           ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro'])
      OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
                 WHERE it.turma_id = aulas.turma_id AND it.user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "aulas_write" ON public.aulas;
CREATE POLICY "aulas_write" ON public.aulas FOR ALL TO authenticated
  USING (
    public.has_role_any(auth.uid(),
      ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
    OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
               WHERE it.turma_id = aulas.turma_id AND it.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role_any(auth.uid(),
      ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
    OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
               WHERE it.turma_id = aulas.turma_id AND it.user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_aulas_updated_at ON public.aulas;
CREATE TRIGGER trg_aulas_updated_at BEFORE UPDATE ON public.aulas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- matriculas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matriculas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  beneficiaria_id uuid REFERENCES public.beneficiarias(id) ON DELETE SET NULL,
  cursista_id uuid REFERENCES public.cursistas(id) ON DELETE SET NULL,
  status text DEFAULT 'inscrita',
  data_inscricao date,
  data_conclusao date,
  motivo_evasao text,
  ficha_inscricao_url text,
  frequencia_percentual numeric,
  assinou_lista boolean DEFAULT false,
  observacao_importacao text,
  certificado_url text,
  certificado_emitido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS matriculas_turma_beneficiaria_uidx
  ON public.matriculas(turma_id, beneficiaria_id) WHERE beneficiaria_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS matriculas_turma_idx ON public.matriculas(turma_id);
CREATE INDEX IF NOT EXISTS matriculas_beneficiaria_idx ON public.matriculas(beneficiaria_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matriculas TO authenticated;
GRANT ALL ON public.matriculas TO service_role;
ALTER TABLE public.matriculas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matriculas_read" ON public.matriculas;
CREATE POLICY "matriculas_read" ON public.matriculas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.turmas t
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
        AND (ur.projeto_id = t.projeto_id OR ur.projeto_id IS NULL)
        AND COALESCE(ur.ativo,true) = true
      WHERE t.id = matriculas.turma_id
    )
    AND (
      NOT public.has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
      OR public.has_role_any(auth.uid(),
           ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro'])
      OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
                 WHERE it.turma_id = matriculas.turma_id AND it.user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "matriculas_write" ON public.matriculas;
CREATE POLICY "matriculas_write" ON public.matriculas FOR ALL TO authenticated
  USING (
    public.has_role_any(auth.uid(),
      ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
    OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
               WHERE it.turma_id = matriculas.turma_id AND it.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role_any(auth.uid(),
      ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
    OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
               WHERE it.turma_id = matriculas.turma_id AND it.user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_matriculas_updated_at ON public.matriculas;
CREATE TRIGGER trg_matriculas_updated_at BEFORE UPDATE ON public.matriculas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- presencas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aula_id uuid NOT NULL REFERENCES public.aulas(id) ON DELETE CASCADE,
  matricula_id uuid NOT NULL REFERENCES public.matriculas(id) ON DELETE CASCADE,
  presente boolean NOT NULL DEFAULT false,
  justificativa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aula_id, matricula_id)
);
CREATE INDEX IF NOT EXISTS presencas_aula_idx ON public.presencas(aula_id);
CREATE INDEX IF NOT EXISTS presencas_matricula_idx ON public.presencas(matricula_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.presencas TO authenticated;
GRANT ALL ON public.presencas TO service_role;
ALTER TABLE public.presencas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presencas_read" ON public.presencas;
CREATE POLICY "presencas_read" ON public.presencas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.aulas a
      JOIN public.turmas t ON t.id = a.turma_id
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
        AND (ur.projeto_id = t.projeto_id OR ur.projeto_id IS NULL)
        AND COALESCE(ur.ativo,true) = true
      WHERE a.id = presencas.aula_id
        AND (
          NOT public.has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
          OR public.has_role_any(auth.uid(),
               ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro'])
          OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
                     WHERE it.turma_id = a.turma_id AND it.user_id = auth.uid())
        )
    )
  );
DROP POLICY IF EXISTS "presencas_write" ON public.presencas;
CREATE POLICY "presencas_write" ON public.presencas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.aulas a
      WHERE a.id = presencas.aula_id AND (
        public.has_role_any(auth.uid(),
          ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
        OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
                   WHERE it.turma_id = a.turma_id AND it.user_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.aulas a
      WHERE a.id = presencas.aula_id AND (
        public.has_role_any(auth.uid(),
          ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
        OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
                   WHERE it.turma_id = a.turma_id AND it.user_id = auth.uid())
      )
    )
  );

DROP TRIGGER IF EXISTS trg_presencas_updated_at ON public.presencas;
CREATE TRIGGER trg_presencas_updated_at BEFORE UPDATE ON public.presencas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- evidencias
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid REFERENCES public.turmas(id) ON DELETE CASCADE,
  aula_id uuid REFERENCES public.aulas(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  descricao text,
  arquivo_url text NOT NULL,
  arquivo_nome text,
  enviado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidencias_turma_idx ON public.evidencias(turma_id);
CREATE INDEX IF NOT EXISTS evidencias_aula_idx ON public.evidencias(aula_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidencias TO authenticated;
GRANT ALL ON public.evidencias TO service_role;
ALTER TABLE public.evidencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidencias_read" ON public.evidencias;
CREATE POLICY "evidencias_read" ON public.evidencias FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.turmas t
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
        AND (ur.projeto_id = t.projeto_id OR ur.projeto_id IS NULL)
        AND COALESCE(ur.ativo,true) = true
      WHERE t.id = evidencias.turma_id
    )
    AND (
      NOT public.has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
      OR public.has_role_any(auth.uid(),
           ARRAY['coordenador_geral','coordenador_pedagogico','administrativo','gestor_financeiro'])
      OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
                 WHERE it.turma_id = evidencias.turma_id AND it.user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "evidencias_write" ON public.evidencias;
CREATE POLICY "evidencias_write" ON public.evidencias FOR ALL TO authenticated
  USING (
    public.has_role_any(auth.uid(),
      ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
    OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
               WHERE it.turma_id = evidencias.turma_id AND it.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role_any(auth.uid(),
      ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
    OR EXISTS (SELECT 1 FROM public.instrutor_turmas it
               WHERE it.turma_id = evidencias.turma_id AND it.user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_evidencias_updated_at ON public.evidencias;
CREATE TRIGGER trg_evidencias_updated_at BEFORE UPDATE ON public.evidencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- view frequencias (compatibilidade com Pedagógico)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.frequencias
WITH (security_invoker = true) AS
SELECT id, aula_id, matricula_id, presente
FROM public.presencas;

GRANT SELECT ON public.frequencias TO authenticated;
GRANT ALL ON public.frequencias TO service_role;
