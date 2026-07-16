-- =============================================================
-- Migração: WhatsApp Amanda — Fase 1
-- Projeto: Gestão Mulheres Conectadas
-- Data: 2026-07-16
-- =============================================================

-- ---------------------------------------------------------------
-- Bloco 1 — Instâncias Evolution + config da Amanda
-- ---------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_instancias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  base_url text NOT NULL,
  instance_name text NOT NULL,
  api_key text,
  numero_e164 text,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'desconectada', -- desconectada|conectando|conectada|erro
  padrao boolean NOT NULL DEFAULT false,
  janela_inicio time NOT NULL DEFAULT '08:00',
  janela_fim time NOT NULL DEFAULT '20:00',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_instancias_padrao_uniq
  ON public.wa_instancias(projeto_id) WHERE padrao;

CREATE TABLE IF NOT EXISTS public.wa_config_amanda (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), -- singleton
  ativo boolean NOT NULL DEFAULT false,
  instancia_padrao_id uuid REFERENCES public.wa_instancias(id) ON DELETE SET NULL,
  max_tentativas int NOT NULL DEFAULT 2,
  cooldown_horas int NOT NULL DEFAULT 24,
  prompt_persona text,
  prompt_recuperacao text,
  prompt_duvidas text,
  escalar_para_humano boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.wa_config_amanda (id) VALUES (true) ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------
-- Bloco 2 — Conversas e mensagens
-- ---------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  instancia_id uuid REFERENCES public.wa_instancias(id) ON DELETE SET NULL,
  cursista_id uuid REFERENCES public.cursistas(id) ON DELETE SET NULL,
  fone_e164 text NOT NULL,
  modo text NOT NULL DEFAULT 'duvidas', -- recuperacao|duvidas|humano
  status text NOT NULL DEFAULT 'ativa', -- ativa|encerrada
  opt_out boolean NOT NULL DEFAULT false,
  ultima_interacao timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instancia_id, fone_e164)
);

CREATE INDEX IF NOT EXISTS wa_conversas_cursista_idx ON public.wa_conversas(cursista_id);
CREATE INDEX IF NOT EXISTS wa_conversas_ultima_idx ON public.wa_conversas(ultima_interacao DESC);

CREATE TABLE IF NOT EXISTS public.wa_conversa_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  direcao text NOT NULL, -- in|out
  origem text NOT NULL, -- cursista|amanda|humano|sistema
  tipo text NOT NULL DEFAULT 'texto', -- texto|imagem|audio|documento
  conteudo text,
  midia_path text,
  evolution_message_id text,
  tokens_in int,
  tokens_out int,
  custo_usd numeric,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_conv_msg_evolution_id_uniq
  ON public.wa_conversa_mensagens(evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_conv_msg_conversa_idx
  ON public.wa_conversa_mensagens(conversa_id, criado_em);

COMMIT;

-- ---------------------------------------------------------------
-- Bloco 3 — Casos de recuperação + fluxos de conversa
-- ---------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.recuperacao_casos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  matricula_id uuid NOT NULL REFERENCES public.matriculas(id) ON DELETE CASCADE,
  aula_id uuid REFERENCES public.aulas(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aberto', -- aberto|em_conversa|respondido|resolvido|escalado|sem_resposta
  motivo_categoria text, -- saude|trabalho|familia|transporte|desmotivacao|financeiro|outro
  dificuldades_relatadas text,
  acao_sugerida text,
  risco_evasao text, -- baixo|medio|alto
  resumo_ia text,
  tentativas int NOT NULL DEFAULT 0,
  proximo_contato timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  UNIQUE (matricula_id, aula_id)
);

CREATE INDEX IF NOT EXISTS recuperacao_casos_status_idx ON public.recuperacao_casos(status);
CREATE INDEX IF NOT EXISTS recuperacao_casos_proximo_idx
  ON public.recuperacao_casos(proximo_contato) WHERE proximo_contato IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wa_fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'custom', -- recuperacao|duvidas|custom
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  gatilho text,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ordem, titulo, objetivo, prompt}]
  prompt_sistema text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMIT;

-- ---------------------------------------------------------------
-- Bloco 4 — RLS
-- ---------------------------------------------------------------
BEGIN;

ALTER TABLE public.wa_instancias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_config_amanda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversa_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recuperacao_casos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_fluxos ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_instancias_coord ON public.wa_instancias FOR ALL
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

CREATE POLICY wa_config_amanda_coord ON public.wa_config_amanda FOR ALL
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

CREATE POLICY wa_conversas_coord ON public.wa_conversas FOR ALL
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

CREATE POLICY wa_conv_msg_coord ON public.wa_conversa_mensagens FOR ALL
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

CREATE POLICY recuperacao_casos_coord ON public.recuperacao_casos FOR ALL
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

CREATE POLICY wa_fluxos_coord ON public.wa_fluxos FOR ALL
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

CREATE POLICY wa_conversas_prof_sel ON public.wa_conversas FOR SELECT
  USING (public.has_role_any(auth.uid(), ARRAY['professor']));
CREATE POLICY wa_conv_msg_prof_sel ON public.wa_conversa_mensagens FOR SELECT
  USING (public.has_role_any(auth.uid(), ARRAY['professor']));
CREATE POLICY recuperacao_casos_prof_sel ON public.recuperacao_casos FOR SELECT
  USING (public.has_role_any(auth.uid(), ARRAY['professor']));
CREATE POLICY wa_fluxos_prof_sel ON public.wa_fluxos FOR SELECT
  USING (public.has_role_any(auth.uid(), ARRAY['professor']));

COMMIT;

-- ---------------------------------------------------------------
-- Bloco 5 — Seeds: políticas de IA + fluxos nativos
-- ---------------------------------------------------------------
BEGIN;

INSERT INTO public.ia_politicas (processo, descricao, complexidade, provedor_preferido, max_tokens, temperatura, usar_fallback)
VALUES
  ('wa_recuperacao_conversa', 'Diálogo da Amanda com aluna faltosa via WhatsApp (recuperação).', 'alta', 'gemini', 1024, 0.6, true),
  ('wa_duvidas_rag', 'Resposta a dúvidas de alunas via WhatsApp com base de conhecimento (RAG).', 'alta', 'gemini', 1024, 0.3, true),
  ('wa_intencao', 'Classificação de intenção de mensagem inbound do WhatsApp.', 'baixa', 'groq', 256, 0.0, true),
  ('wa_recuperacao_extracao', 'Extração estruturada de motivo/dificuldades/risco do caso de recuperação.', 'media', 'gemini', 512, 0.1, true)
ON CONFLICT (processo) DO NOTHING;

INSERT INTO public.wa_fluxos (nome, tipo, descricao, gatilho, etapas)
VALUES
  ('Recuperação de aluna faltosa', 'recuperacao',
   'Contato proativo após falta: acolhe, entende o motivo, levanta dificuldades e sugere caminhos de retorno.',
   'Falta registrada em presencas (cron diário) sem caso aberto',
   '[{"ordem":1,"titulo":"Abertura","objetivo":"Cumprimentar pelo nome, se apresentar como assistente virtual do projeto e perguntar com cuidado o motivo da falta."},{"ordem":2,"titulo":"Escuta","objetivo":"Aprofundar com empatia: dificuldades no curso, no AVA, e o que ajudaria a voltar."},{"ordem":3,"titulo":"Encaminhamento","objetivo":"Sugerir caminhos (reposição, material no AVA, falar com instrutor) e confirmar próximo passo."},{"ordem":4,"titulo":"Registro","objetivo":"Extrair motivo, dificuldades e risco de evasão; escalar se sensível."}]'::jsonb),
  ('Tira-dúvidas (AVA e curso)', 'duvidas',
   'Resposta a mensagens espontâneas usando exclusivamente a base de conhecimento e dados do curso.',
   'Mensagem inbound sem caso de recuperação ativo',
   '[{"ordem":1,"titulo":"Classificação","objetivo":"Identificar se a dúvida é de AVA/plataforma, conteúdo, administrativa ou fora de escopo."},{"ordem":2,"titulo":"Resposta com base","objetivo":"Buscar na base de conhecimento e responder citando a fonte; nunca inventar."},{"ordem":3,"titulo":"Fallback","objetivo":"Sem resposta na base: admitir e encaminhar para a coordenação."}]'::jsonb)
ON CONFLICT DO NOTHING;

COMMIT;
