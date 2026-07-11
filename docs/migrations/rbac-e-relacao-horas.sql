-- ============================================================================
-- RBAC efetivo + módulo Relação de Horas
-- Idempotente: pode rodar múltiplas vezes.
-- Aplica em: (schema pedagógico legado + tabelas do projeto Mulheres Conectadas)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helpers de papel
-- ---------------------------------------------------------------------------

-- Garante enum app_role com todos os papéis usados no client
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'coordenador_geral',
      'gestor_financeiro',
      'administrativo',
      'coordenador_pedagogico',
      'professor',
      'auxiliar_pedagogico'
    );
  ELSE
    -- adiciona valores faltantes sem quebrar
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador_geral'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_financeiro'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrativo'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador_pedagogico'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'professor'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auxiliar_pedagogico'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

-- has_role: usada em várias policies; reafirma versão security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role::text
  );
$$;

-- has_role_any: aceita array de textos (mais tolerante a variações de enum)
CREATE OR REPLACE FUNCTION public.has_role_any(_user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = ANY(_roles)
  );
$$;

-- Helper: usuário logado tem vínculo com a turma?
CREATE OR REPLACE FUNCTION public.instrutor_da_turma(_turma_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instrutor_turmas
    WHERE user_id = auth.uid() AND turma_id = _turma_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_any(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.instrutor_da_turma(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. instrutor_turmas: adicionar valor_hora
-- ---------------------------------------------------------------------------

ALTER TABLE public.instrutor_turmas
  ADD COLUMN IF NOT EXISTS valor_hora numeric NOT NULL DEFAULT 40.00;

-- ---------------------------------------------------------------------------
-- 2. Tabelas de Relação de Horas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.relacoes_horas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes_referencia date NOT NULL,
  local_trabalho text,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','enviada','aprovada','rejeitada')),
  total_horas numeric NOT NULL DEFAULT 0,
  valor_hora numeric NOT NULL DEFAULT 40.00,
  valor_total numeric NOT NULL DEFAULT 0,
  assinatura_nome text,
  assinatura_hash text,
  assinado_em timestamptz,
  enviado_em timestamptz,
  avaliado_por uuid REFERENCES auth.users(id),
  avaliado_em timestamptz,
  observacao_avaliacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mes_referencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relacoes_horas TO authenticated;
GRANT ALL ON public.relacoes_horas TO service_role;

CREATE TABLE IF NOT EXISTS public.relacoes_horas_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relacao_id uuid NOT NULL REFERENCES public.relacoes_horas(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora_entrada time,
  hora_saida time,
  total_horas numeric NOT NULL DEFAULT 0,
  valor_dia numeric NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rh_itens_relacao ON public.relacoes_horas_itens(relacao_id);
CREATE INDEX IF NOT EXISTS idx_rh_user_mes ON public.relacoes_horas(user_id, mes_referencia);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relacoes_horas_itens TO authenticated;
GRANT ALL ON public.relacoes_horas_itens TO service_role;

ALTER TABLE public.relacoes_horas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relacoes_horas_itens ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (usa função genérica se existir; senão cria)
CREATE OR REPLACE FUNCTION public.tg_set_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_rh_atualizado_em ON public.relacoes_horas;
CREATE TRIGGER trg_rh_atualizado_em BEFORE UPDATE ON public.relacoes_horas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_atualizado_em();

-- Policies: relacoes_horas
DROP POLICY IF EXISTS "rh_own_all" ON public.relacoes_horas;
DROP POLICY IF EXISTS "rh_own_select" ON public.relacoes_horas;
DROP POLICY IF EXISTS "rh_own_insert" ON public.relacoes_horas;
DROP POLICY IF EXISTS "rh_own_update_rascunho" ON public.relacoes_horas;
DROP POLICY IF EXISTS "rh_own_delete_rascunho" ON public.relacoes_horas;
DROP POLICY IF EXISTS "rh_financeiro_select" ON public.relacoes_horas;
DROP POLICY IF EXISTS "rh_financeiro_update" ON public.relacoes_horas;

CREATE POLICY "rh_own_select" ON public.relacoes_horas FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro']));

CREATE POLICY "rh_own_insert" ON public.relacoes_horas FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "rh_own_update_rascunho" ON public.relacoes_horas FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'rascunho')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "rh_own_delete_rascunho" ON public.relacoes_horas FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'rascunho');

CREATE POLICY "rh_financeiro_update" ON public.relacoes_horas FOR UPDATE TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro']));

-- Policies: relacoes_horas_itens
DROP POLICY IF EXISTS "rhi_own_select" ON public.relacoes_horas_itens;
DROP POLICY IF EXISTS "rhi_own_write" ON public.relacoes_horas_itens;
DROP POLICY IF EXISTS "rhi_financeiro_select" ON public.relacoes_horas_itens;

CREATE POLICY "rhi_own_select" ON public.relacoes_horas_itens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.relacoes_horas r
    WHERE r.id = relacao_id
      AND (r.user_id = auth.uid()
           OR public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro']))
  ));

CREATE POLICY "rhi_own_write" ON public.relacoes_horas_itens FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.relacoes_horas r
    WHERE r.id = relacao_id AND r.user_id = auth.uid() AND r.status = 'rascunho'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.relacoes_horas r
    WHERE r.id = relacao_id AND r.user_id = auth.uid() AND r.status = 'rascunho'
  ));

-- ---------------------------------------------------------------------------
-- 3. RLS por papel — substitui "USING true" nas tabelas sensíveis
-- Blocos DO envoltos com IF EXISTS para não falhar se a tabela não existir
-- no ambiente.
-- ---------------------------------------------------------------------------

-- utilitário para aplicar 4 policies padrão em uma tabela financeira
CREATE OR REPLACE FUNCTION public._aplicar_rls_financeiro(_tbl regclass)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE tname text := _tbl::text;
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tname);
  EXECUTE format('DROP POLICY IF EXISTS "fin_all" ON %s', tname);
  EXECUTE format('DROP POLICY IF EXISTS "auth_all" ON %s', tname);
  EXECUTE format('DROP POLICY IF EXISTS "auth users manage %s" ON %s', tname, tname);
  EXECUTE format($f$CREATE POLICY "fin_all" ON %s FOR ALL TO authenticated
    USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro']))
    WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro']))$f$, tname);
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.despesas','public.fornecedores','public.orcamento_itens',
    'public.rubricas','public.cotacoes','public.cotacao_propostas'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      PERFORM public._aplicar_rls_financeiro(t::regclass);
    END IF;
  END LOOP;
END $$;

-- Pedagógico sensível: coordenação total + professor só das suas turmas
CREATE OR REPLACE FUNCTION public._aplicar_rls_turma(_tbl regclass, _turma_col text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE tname text := _tbl::text;
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tname);
  EXECUTE format('DROP POLICY IF EXISTS "ped_coord_all" ON %s', tname);
  EXECUTE format('DROP POLICY IF EXISTS "ped_prof_rw" ON %s', tname);
  EXECUTE format('DROP POLICY IF EXISTS "auth_all" ON %s', tname);
  EXECUTE format('DROP POLICY IF EXISTS "auth users manage %s" ON %s', tname, tname);
  EXECUTE format($f$CREATE POLICY "ped_coord_all" ON %s FOR ALL TO authenticated
    USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']))
    WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']))$f$, tname);
  EXECUTE format($f$CREATE POLICY "ped_prof_rw" ON %s FOR ALL TO authenticated
    USING (public.has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
           AND public.instrutor_da_turma(%I))
    WITH CHECK (public.has_role_any(auth.uid(), ARRAY['professor','auxiliar_pedagogico'])
           AND public.instrutor_da_turma(%I))$f$, tname, _turma_col, _turma_col);
END $$;

DO $$
BEGIN
  IF to_regclass('public.aulas') IS NOT NULL THEN
    PERFORM public._aplicar_rls_turma('public.aulas'::regclass, 'turma_id');
  END IF;
  IF to_regclass('public.frequencia') IS NOT NULL THEN
    -- frequencia pode não ter turma_id direto — pular se coluna ausente
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='frequencia' AND column_name='turma_id') THEN
      PERFORM public._aplicar_rls_turma('public.frequencia'::regclass, 'turma_id');
    END IF;
  END IF;
  IF to_regclass('public.frequencias') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='frequencias' AND column_name='turma_id') THEN
      PERFORM public._aplicar_rls_turma('public.frequencias'::regclass, 'turma_id');
    END IF;
  END IF;
  IF to_regclass('public.presencas') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='presencas' AND column_name='turma_id') THEN
      PERFORM public._aplicar_rls_turma('public.presencas'::regclass, 'turma_id');
    END IF;
  END IF;
  IF to_regclass('public.matriculas') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='matriculas' AND column_name='turma_id') THEN
      PERFORM public._aplicar_rls_turma('public.matriculas'::regclass, 'turma_id');
    END IF;
  END IF;
  IF to_regclass('public.evidencias_aula') IS NOT NULL THEN
    -- evidencia liga a aula_id → juntar via aulas
    ALTER TABLE public.evidencias_aula ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "ev_coord_all" ON public.evidencias_aula;
    DROP POLICY IF EXISTS "ev_prof_rw" ON public.evidencias_aula;
    CREATE POLICY "ev_coord_all" ON public.evidencias_aula FOR ALL TO authenticated
      USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']))
      WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']));
    CREATE POLICY "ev_prof_rw" ON public.evidencias_aula FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.aulas a WHERE a.id = aula_id AND public.instrutor_da_turma(a.turma_id)))
      WITH CHECK (EXISTS (SELECT 1 FROM public.aulas a WHERE a.id = aula_id AND public.instrutor_da_turma(a.turma_id)));
  END IF;
END $$;

-- Turmas: coordenação escreve; todos autenticados leem; professor vê todas mas
-- a UI filtra pelo vínculo. (Deixar leitura ampla para não quebrar dashboards.)
DO $$
BEGIN
  IF to_regclass('public.turmas') IS NOT NULL THEN
    ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "turmas_read" ON public.turmas;
    DROP POLICY IF EXISTS "turmas_write" ON public.turmas;
    CREATE POLICY "turmas_read" ON public.turmas FOR SELECT TO authenticated USING (true);
    CREATE POLICY "turmas_write" ON public.turmas FOR ALL TO authenticated
      USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']))
      WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']));
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Relação de Horas — Modelo oficial (multi-turma no mesmo dia)
-- ============================================================================
BEGIN;

ALTER TABLE public.relacoes_horas_itens
  ADD COLUMN IF NOT EXISTS saida_almoco time,
  ADD COLUMN IF NOT EXISTS retorno time,
  ADD COLUMN IF NOT EXISTS conteudo text;

ALTER TABLE public.relacoes_horas
  ADD COLUMN IF NOT EXISTS dias_trabalhados int NOT NULL DEFAULT 0;

COMMIT;