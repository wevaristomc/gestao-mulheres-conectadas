-- ============================================================================
-- RODADA 2 — Modo Guiado com IA + WhatsApp individual/compartilhável
-- Aplicar manualmente. Idempotente.
-- ============================================================================

-- 1) Cache do guia IA por atividade -----------------------------------------
ALTER TABLE public.etapa_atividades
  ADD COLUMN IF NOT EXISTS guia_ia jsonb;

CREATE INDEX IF NOT EXISTS etapa_atividades_guia_ia_gin
  ON public.etapa_atividades USING gin (guia_ia);

-- 2) Política IA do processo "orbe_guia" -------------------------------------
INSERT INTO public.ia_politicas
  (processo, descricao, complexidade, provedor_preferido, max_tokens, temperatura, usar_fallback)
VALUES
  ('orbe_guia',
   'Guia passo-a-passo por etapa/atividade dentro do app (Modo guiado).',
   'media', 'gemini', 1400, 0.3, true)
ON CONFLICT (processo) DO NOTHING;

-- 3) WhatsApp — dono + visibilidade ------------------------------------------
ALTER TABLE public.wa_importacoes
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibilidade text NOT NULL DEFAULT 'privado';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wa_importacoes_visibilidade_chk'
  ) THEN
    ALTER TABLE public.wa_importacoes
      ADD CONSTRAINT wa_importacoes_visibilidade_chk
      CHECK (visibilidade IN ('privado','compartilhado_todos','compartilhado_selecionados'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wa_importacoes_owner_idx ON public.wa_importacoes(owner_id);
CREATE INDEX IF NOT EXISTS wa_importacoes_visibilidade_idx ON public.wa_importacoes(visibilidade);

-- 4) Tabela de compartilhamentos individuais ---------------------------------
CREATE TABLE IF NOT EXISTS public.wa_compartilhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL REFERENCES public.wa_importacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (importacao_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_compartilhamentos TO authenticated;
GRANT ALL ON public.wa_compartilhamentos TO service_role;

ALTER TABLE public.wa_compartilhamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_compartilhamentos_select ON public.wa_compartilhamentos;
CREATE POLICY wa_compartilhamentos_select ON public.wa_compartilhamentos
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.wa_importacoes i
      WHERE i.id = importacao_id AND i.owner_id = auth.uid()
    )
    OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','admin','coordenador'])
  );

DROP POLICY IF EXISTS wa_compartilhamentos_write ON public.wa_compartilhamentos;
CREATE POLICY wa_compartilhamentos_write ON public.wa_compartilhamentos
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.wa_importacoes i
      WHERE i.id = importacao_id AND (
        i.owner_id = auth.uid()
        OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','admin','coordenador'])
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wa_importacoes i
      WHERE i.id = importacao_id AND (
        i.owner_id = auth.uid()
        OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','admin','coordenador'])
      )
    )
  );

-- 5) Backfill --------------------------------------------------------------------
-- Importações existentes: dono = coordenador_geral mais antigo, visibilidade
-- = compartilhado_todos (preserva o comportamento anterior de "todos veem").
UPDATE public.wa_importacoes SET visibilidade = 'compartilhado_todos'
  WHERE visibilidade IS NULL OR visibilidade = 'privado';

WITH coord AS (
  SELECT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role::text IN ('coordenador_geral','admin')
    AND COALESCE(ur.ativo, true) = true
  ORDER BY ur.criado_em NULLS LAST, ur.user_id
  LIMIT 1
)
UPDATE public.wa_importacoes SET owner_id = coord.user_id
  FROM coord
  WHERE owner_id IS NULL;

-- 6) Helper — a importação é visível para o usuário? -------------------------
CREATE OR REPLACE FUNCTION public.wa_importacao_visivel(_importacao_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wa_importacoes i
    WHERE i.id = _importacao_id
      AND (
        i.owner_id = _user_id
        OR i.visibilidade = 'compartilhado_todos'
        OR (i.visibilidade = 'compartilhado_selecionados' AND EXISTS (
            SELECT 1 FROM public.wa_compartilhamentos c
            WHERE c.importacao_id = i.id AND c.user_id = _user_id
        ))
        OR public.has_role_any(_user_id, ARRAY['coordenador_geral','administrativo','admin','coordenador'])
      )
  );
$$;

-- 7) RLS — wa_importacoes -----------------------------------------------------
ALTER TABLE public.wa_importacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_importacoes_all ON public.wa_importacoes;
DROP POLICY IF EXISTS wa_importacoes_select ON public.wa_importacoes;
DROP POLICY IF EXISTS wa_importacoes_insert ON public.wa_importacoes;
DROP POLICY IF EXISTS wa_importacoes_update ON public.wa_importacoes;
DROP POLICY IF EXISTS wa_importacoes_delete ON public.wa_importacoes;

CREATE POLICY wa_importacoes_select ON public.wa_importacoes
  FOR SELECT TO authenticated USING (public.wa_importacao_visivel(id, auth.uid()));

CREATE POLICY wa_importacoes_insert ON public.wa_importacoes
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY wa_importacoes_update ON public.wa_importacoes
  FOR UPDATE TO authenticated USING (
    owner_id = auth.uid()
    OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','admin','coordenador'])
  ) WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','admin','coordenador'])
  );

CREATE POLICY wa_importacoes_delete ON public.wa_importacoes
  FOR DELETE TO authenticated USING (
    owner_id = auth.uid()
    OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','admin','coordenador'])
  );

-- 8) RLS propagada — wa_mensagens / wa_midias_analise / wa_resumos / wa_grupos
-- Todas leem via join com a importação (ou grupo). O write continua
-- coberto por policies existentes (coordenação).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['wa_mensagens','wa_midias_analise','wa_resumos']) AS t
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.t || '_all', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.t || '_select', r.t);
  END LOOP;
END $$;

-- wa_mensagens: liberado se a importação é visível
CREATE POLICY wa_mensagens_select ON public.wa_mensagens
  FOR SELECT TO authenticated USING (
    public.wa_importacao_visivel(importacao_id, auth.uid())
  );

-- wa_midias_analise: via mensagem → importação
CREATE POLICY wa_midias_analise_select ON public.wa_midias_analise
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.wa_mensagens m
      WHERE m.id = mensagem_id
        AND public.wa_importacao_visivel(m.importacao_id, auth.uid())
    )
  );

-- wa_resumos: por grupo — se o usuário vê pelo menos uma importação daquele grupo, vê os resumos.
CREATE POLICY wa_resumos_select ON public.wa_resumos
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.wa_importacoes i
      WHERE i.grupo_id = wa_resumos.grupo_id
        AND public.wa_importacao_visivel(i.id, auth.uid())
    )
    OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','admin','coordenador'])
  );

-- Observação: writes/updates/deletes em wa_mensagens/wa_midias_analise/wa_resumos
-- permanecem cobertos pelas políticas anteriores (coordenação/administrativo);
-- não removemos as policies de escrita ao dropar *_all porque este arquivo só
-- redefine SELECT.

-- FIM ----------------------------------------------------------------------