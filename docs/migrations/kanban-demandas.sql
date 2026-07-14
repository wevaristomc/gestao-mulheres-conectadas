-- ============================================================================
-- RODADA 1 — Kanban de Demandas com Responsáveis (evolução de etapa_atividades)
-- Aplicar manualmente. Idempotente.
-- ============================================================================

-- 1) Colunas novas em etapa_atividades ---------------------------------------
ALTER TABLE public.etapa_atividades
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS colaboradores uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS ordem_kanban numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descricao_detalhada text;

-- CHECK de prioridade (drop antigo se existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'etapa_atividades_prioridade_chk'
  ) THEN
    ALTER TABLE public.etapa_atividades
      ADD CONSTRAINT etapa_atividades_prioridade_chk
      CHECK (prioridade IN ('baixa','media','alta','critica'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS etapa_atividades_responsavel_idx
  ON public.etapa_atividades(responsavel_id);
CREATE INDEX IF NOT EXISTS etapa_atividades_status_idx
  ON public.etapa_atividades(status);
CREATE INDEX IF NOT EXISTS etapa_atividades_prazo_idx
  ON public.etapa_atividades(prazo);

-- 2) Comentários --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atividade_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id uuid NOT NULL REFERENCES public.etapa_atividades(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texto text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atividade_comentarios TO authenticated;
GRANT ALL ON public.atividade_comentarios TO service_role;

ALTER TABLE public.atividade_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atividade_comentarios_select ON public.atividade_comentarios;
CREATE POLICY atividade_comentarios_select ON public.atividade_comentarios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS atividade_comentarios_insert ON public.atividade_comentarios;
CREATE POLICY atividade_comentarios_insert ON public.atividade_comentarios
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS atividade_comentarios_update_own ON public.atividade_comentarios;
CREATE POLICY atividade_comentarios_update_own ON public.atividade_comentarios
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS atividade_comentarios_delete_own ON public.atividade_comentarios;
CREATE POLICY atividade_comentarios_delete_own ON public.atividade_comentarios
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS atividade_comentarios_atividade_idx
  ON public.atividade_comentarios(atividade_id);

-- 3) Permissão do módulo "minhas-demandas" (visível a todos os papéis) -------
-- OBS.: aplicado no banco real com o vocabulário V2 usado por
-- `permissoes_papel` / `has_permission` (admin / coordenador / instrutor /
-- financeiro). Se o banco de destino ainda usar o vocabulário legado
-- (coordenador_geral / administrativo / …), rode o bloco alternativo comentado
-- ao final deste arquivo.
INSERT INTO public.permissoes_papel (role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir)
SELECT r, 'minhas-demandas', true, false, true, false
FROM (VALUES
  ('admin'),
  ('coordenador'),
  ('instrutor'),
  ('financeiro')
) AS v(r)
ON CONFLICT (role, modulo) DO NOTHING;

-- Alternativa (vocabulário legado app_role) — só use se o banco alvo ainda
-- não migrou para V2:
-- INSERT INTO public.permissoes_papel (role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir)
-- SELECT r, 'minhas-demandas', true, false, true, false
-- FROM (VALUES
--   ('coordenador_geral'),
--   ('administrativo'),
--   ('coordenador_pedagogico'),
--   ('gestor_financeiro'),
--   ('professor'),
--   ('auxiliar_pedagogico')
-- ) AS v(r)
-- ON CONFLICT (role, modulo) DO NOTHING;