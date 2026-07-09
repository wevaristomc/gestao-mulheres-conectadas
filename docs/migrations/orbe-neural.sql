-- =====================================================================
-- Orbe Neural — assistente de IA conversacional do projeto
-- Idempotente. Segue padrão do stack (RLS + GRANT + auth manage).
-- Já aplicada via migration tool. Este arquivo é a versão canônica.
-- =====================================================================

-- 1. orbe_conversas
CREATE TABLE IF NOT EXISTS public.orbe_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbe_conversas TO authenticated;
GRANT ALL ON public.orbe_conversas TO service_role;
ALTER TABLE public.orbe_conversas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orbe_conversas_own" ON public.orbe_conversas;
CREATE POLICY "orbe_conversas_own" ON public.orbe_conversas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS orbe_conversas_user_idx
  ON public.orbe_conversas (user_id, atualizado_em DESC);

-- 2. orbe_mensagens
CREATE TABLE IF NOT EXISTS public.orbe_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.orbe_conversas(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content text NOT NULL,
  tool_name text,
  tokens int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbe_mensagens TO authenticated;
GRANT ALL ON public.orbe_mensagens TO service_role;
ALTER TABLE public.orbe_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orbe_mensagens_own" ON public.orbe_mensagens;
CREATE POLICY "orbe_mensagens_own" ON public.orbe_mensagens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orbe_conversas c
                 WHERE c.id = orbe_mensagens.conversa_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orbe_conversas c
                      WHERE c.id = orbe_mensagens.conversa_id AND c.user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS orbe_mensagens_conv_idx
  ON public.orbe_mensagens (conversa_id, criado_em ASC);

-- 3. notificacoes
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  severidade text NOT NULL DEFAULT 'info' CHECK (severidade IN ('info','aviso','critico')),
  titulo text NOT NULL,
  corpo text,
  link_rota text,
  lida boolean NOT NULL DEFAULT false,
  origem text NOT NULL DEFAULT 'orbe',
  chave_dedup text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notificacoes_select" ON public.notificacoes;
CREATE POLICY "notificacoes_select" ON public.notificacoes FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "notificacoes_update" ON public.notificacoes;
CREATE POLICY "notificacoes_update" ON public.notificacoes FOR UPDATE TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "notificacoes_insert" ON public.notificacoes;
CREATE POLICY "notificacoes_insert" ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "notificacoes_delete" ON public.notificacoes;
CREATE POLICY "notificacoes_delete" ON public.notificacoes FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS notificacoes_user_lida_idx
  ON public.notificacoes (user_id, lida, criado_em DESC);
CREATE INDEX IF NOT EXISTS notificacoes_dedup_idx
  ON public.notificacoes (tipo, chave_dedup, criado_em DESC)
  WHERE chave_dedup IS NOT NULL;

-- 4. Política de IA para o Orbe
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='ia_politicas') THEN
    INSERT INTO public.ia_politicas (processo, max_tokens, temperatura, usar_fallback)
    VALUES ('orbe_assistente', 2048, 0.4, true)
    ON CONFLICT (processo) DO NOTHING;
    INSERT INTO public.ia_politicas (processo, max_tokens, temperatura, usar_fallback)
    VALUES ('orbe_transcricao', 1024, 0.0, true)
    ON CONFLICT (processo) DO NOTHING;
  END IF;
END $$;

-- 5. Bônus: habilita RLS + "auth manage" em tabelas hoje sem proteção
DO $$
DECLARE t text;
  tabelas text[] := ARRAY['projetos','pendencias','aulas','metas_indicadores',
    'orcamento_itens','cotacoes','cotacao_propostas','agent_runs','deq_chunks'];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
      EXECUTE format('DROP POLICY IF EXISTS "auth users manage %I" ON public.%I;', t, t);
      EXECUTE format('CREATE POLICY "auth users manage %I" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t, t);
    END IF;
  END LOOP;
END $$;
