-- =============================================================
-- IA BYOK core: tabelas ia_provedores, ia_politicas, ia_logs_uso
-- Idempotente. Nenhuma api_key é inserida via seed.
-- =============================================================

-- ---------- ia_provedores ----------
CREATE TABLE IF NOT EXISTS public.ia_provedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor text NOT NULL UNIQUE,
  nome_exibicao text,
  base_url text NOT NULL,
  api_key text,
  ativo boolean NOT NULL DEFAULT true,
  prioridade integer NOT NULL DEFAULT 100,
  modelo_padrao text,
  modelos_disponiveis jsonb,
  gratuito boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_provedores TO authenticated;
GRANT ALL ON public.ia_provedores TO service_role;

ALTER TABLE public.ia_provedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ia_provedores coord read" ON public.ia_provedores;
CREATE POLICY "ia_provedores coord read" ON public.ia_provedores
  FOR SELECT TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']));

DROP POLICY IF EXISTS "ia_provedores coord write" ON public.ia_provedores;
CREATE POLICY "ia_provedores coord write" ON public.ia_provedores
  FOR ALL TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']));

DROP TRIGGER IF EXISTS trg_ia_provedores_updated ON public.ia_provedores;
CREATE TRIGGER trg_ia_provedores_updated
  BEFORE UPDATE ON public.ia_provedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- ia_politicas ----------
CREATE TABLE IF NOT EXISTS public.ia_politicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo text NOT NULL UNIQUE,
  descricao text,
  complexidade text,
  provedor_preferido text,
  max_tokens integer,
  temperatura numeric,
  usar_fallback boolean NOT NULL DEFAULT true,
  prioridade integer NOT NULL DEFAULT 100,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_politicas TO authenticated;
GRANT ALL ON public.ia_politicas TO service_role;

ALTER TABLE public.ia_politicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ia_politicas coord read" ON public.ia_politicas;
CREATE POLICY "ia_politicas coord read" ON public.ia_politicas
  FOR SELECT TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']));

DROP POLICY IF EXISTS "ia_politicas coord write" ON public.ia_politicas;
CREATE POLICY "ia_politicas coord write" ON public.ia_politicas
  FOR ALL TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']));

DROP TRIGGER IF EXISTS trg_ia_politicas_updated ON public.ia_politicas;
CREATE TRIGGER trg_ia_politicas_updated
  BEFORE UPDATE ON public.ia_politicas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- ia_logs_uso ----------
CREATE TABLE IF NOT EXISTS public.ia_logs_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo text,
  provedor text,
  modelo text,
  tokens_entrada integer NOT NULL DEFAULT 0,
  tokens_saida integer NOT NULL DEFAULT 0,
  sucesso boolean NOT NULL DEFAULT true,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ia_logs_uso_criado_em_idx ON public.ia_logs_uso (criado_em DESC);
CREATE INDEX IF NOT EXISTS ia_logs_uso_provedor_idx ON public.ia_logs_uso (provedor);

GRANT SELECT, INSERT ON public.ia_logs_uso TO authenticated;
GRANT ALL ON public.ia_logs_uso TO service_role;

ALTER TABLE public.ia_logs_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ia_logs_uso coord read" ON public.ia_logs_uso;
CREATE POLICY "ia_logs_uso coord read" ON public.ia_logs_uso
  FOR SELECT TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']));

DROP POLICY IF EXISTS "ia_logs_uso coord insert" ON public.ia_logs_uso;
CREATE POLICY "ia_logs_uso coord insert" ON public.ia_logs_uso
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico']));

-- ---------- Seeds: provedores conhecidos (sem api_key) ----------
INSERT INTO public.ia_provedores (provedor, nome_exibicao, base_url, prioridade, modelo_padrao, modelos_disponiveis, gratuito, ativo)
VALUES
  ('gemini','Google Gemini','https://generativelanguage.googleapis.com/v1beta', 10, 'gemini-2.5-flash',
    '["gemini-2.5-flash","gemini-2.5-pro","gemini-1.5-flash","gemini-1.5-pro"]'::jsonb, true, true),
  ('groq','Groq','https://api.groq.com/openai/v1', 20, 'llama-3.1-70b-versatile',
    '["llama-3.1-70b-versatile","llama-3.1-8b-instant","mixtral-8x7b-32768"]'::jsonb, true, true),
  ('openai','OpenAI','https://api.openai.com/v1', 30, 'gpt-4o-mini',
    '["gpt-4o-mini","gpt-4o","gpt-4.1-mini","gpt-4.1"]'::jsonb, false, true),
  ('anthropic','Anthropic Claude','https://api.anthropic.com/v1', 40, 'claude-3-5-haiku-latest',
    '["claude-3-5-haiku-latest","claude-3-5-sonnet-latest","claude-3-opus-latest"]'::jsonb, false, true),
  ('openrouter','OpenRouter','https://openrouter.ai/api/v1', 50, 'openai/gpt-4o-mini',
    '["openai/gpt-4o-mini","openai/gpt-4o","anthropic/claude-3.5-sonnet","google/gemini-2.5-flash"]'::jsonb, false, true)
ON CONFLICT (provedor) DO NOTHING;

-- ---------- Seeds: políticas por processo (conhecidas do repositório) ----------
INSERT INTO public.ia_politicas (processo, descricao, complexidade, provedor_preferido, max_tokens, temperatura, usar_fallback)
VALUES
  ('analise_relatorio','Análises curtas por aba de Relatórios (frequência, pedagógico, orçamentário, metas).','media','gemini', 900, 0.4, true),
  ('relatorio_inscricoes','Análise territorial das inscrições (por município/bairro/turno).','alta','gemini', 1800, 0.25, true),
  ('relatorio_parcial_objeto','Geração assistida do Relatório Parcial de Execução do Objeto (DEQ Item I).','alta','gemini', 4096, 0.4, true),
  ('orbe','Assistente Orbe (chat interno).','media','gemini', 1200, 0.5, true),
  ('leitor_lista_presenca','Leitura de listas de presença (PDF/imagem) ancorada no elenco da turma.','alta','gemini', 2048, 0.1, true),
  ('classificacao_edital','Classificação de editais captados.','baixa','groq', 400, 0.2, true),
  ('resumo_edital','Resumo de editais.','media','gemini', 800, 0.3, true),
  ('chat_geral','Uso genérico do roteador.','media', NULL, 800, 0.4, true),
  ('guia_atividade','Guia passo-a-passo de atividades das etapas.','media','gemini', 1200, 0.4, true),
  ('teste_conexao','Sonda de conectividade dos provedores.','baixa', NULL, 20, 0.0, false)
ON CONFLICT (processo) DO NOTHING;