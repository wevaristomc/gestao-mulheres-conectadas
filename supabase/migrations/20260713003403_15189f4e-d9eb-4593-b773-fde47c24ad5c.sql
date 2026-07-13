DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.app_role AS ENUM (
      'coordenador_geral',
      'gestor_financeiro',
      'administrativo',
      'coordenador_pedagogico',
      'professor',
      'auxiliar_pedagogico'
    );
  ELSE
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador_geral'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_financeiro'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrativo'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador_pedagogico'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'professor'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auxiliar_pedagogico'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  vigencia_inicio date,
  vigencia_fim date,
  valor_global numeric,
  custo_aluno_hora numeric,
  executora_nome text,
  cnpj text,
  endereco text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT ALL ON public.projetos TO service_role;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, projeto_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  codigo_turma text,
  codigo text,
  nome text,
  municipio text,
  turno text,
  horario_realizacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.turmas TO authenticated;
GRANT ALL ON public.turmas TO service_role;
ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.instrutor_turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  valor_hora numeric NOT NULL DEFAULT 40.00,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, turma_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instrutor_turmas TO authenticated;
GRANT ALL ON public.instrutor_turmas TO service_role;
ALTER TABLE public.instrutor_turmas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS vigencia_fim date,
  ADD COLUMN IF NOT EXISTS valor_global numeric,
  ADD COLUMN IF NOT EXISTS custo_aluno_hora numeric,
  ADD COLUMN IF NOT EXISTS executora_nome text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS codigo_turma text,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS turno text,
  ADD COLUMN IF NOT EXISTS horario_realizacao text,
  ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.instrutor_turmas
  ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS valor_hora numeric NOT NULL DEFAULT 40.00,
  ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();

UPDATE public.turmas
SET codigo_turma = COALESCE(codigo_turma, codigo)
WHERE codigo_turma IS NULL AND codigo IS NOT NULL;

UPDATE public.instrutor_turmas it
SET projeto_id = t.projeto_id
FROM public.turmas t
WHERE it.turma_id = t.id
  AND it.projeto_id IS NULL;

CREATE INDEX IF NOT EXISTS turmas_projeto_id_idx ON public.turmas(projeto_id);
CREATE UNIQUE INDEX IF NOT EXISTS turmas_codigo_turma_uidx ON public.turmas(upper(codigo_turma)) WHERE codigo_turma IS NOT NULL;
CREATE INDEX IF NOT EXISTS instrutor_turmas_projeto_id_idx ON public.instrutor_turmas(projeto_id);
CREATE INDEX IF NOT EXISTS instrutor_turmas_user_id_idx ON public.instrutor_turmas(user_id);
CREATE INDEX IF NOT EXISTS user_roles_user_projeto_idx ON public.user_roles(user_id, projeto_id);

CREATE OR REPLACE FUNCTION public.has_role_any(_user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_project_admin(_user_id uuid, _projeto_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (projeto_id = _projeto_id OR projeto_id IS NULL)
      AND role::text IN ('coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico')
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role_any(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_admin(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "projetos_authenticated_read" ON public.projetos;
CREATE POLICY "projetos_authenticated_read" ON public.projetos
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "projetos_admin_update" ON public.projetos;
CREATE POLICY "projetos_admin_update" ON public.projetos
FOR UPDATE TO authenticated
USING (public.is_project_admin(auth.uid(), id))
WITH CHECK (public.is_project_admin(auth.uid(), id));

DROP POLICY IF EXISTS "projetos_admin_insert" ON public.projetos;
CREATE POLICY "projetos_admin_insert" ON public.projetos
FOR INSERT TO authenticated
WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo']));

DROP POLICY IF EXISTS "user_roles_own_or_admin_read" ON public.user_roles;
CREATE POLICY "user_roles_own_or_admin_read" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_project_admin(auth.uid(), projeto_id));

DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;
CREATE POLICY "user_roles_admin_manage" ON public.user_roles
FOR ALL TO authenticated
USING (public.is_project_admin(auth.uid(), projeto_id))
WITH CHECK (public.is_project_admin(auth.uid(), projeto_id));

DROP POLICY IF EXISTS "turmas_authenticated_read" ON public.turmas;
CREATE POLICY "turmas_authenticated_read" ON public.turmas
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "turmas_admin_manage" ON public.turmas;
CREATE POLICY "turmas_admin_manage" ON public.turmas
FOR ALL TO authenticated
USING (public.is_project_admin(auth.uid(), projeto_id))
WITH CHECK (public.is_project_admin(auth.uid(), projeto_id));

DROP POLICY IF EXISTS "instrutor_turmas_own_or_admin_read" ON public.instrutor_turmas;
CREATE POLICY "instrutor_turmas_own_or_admin_read" ON public.instrutor_turmas
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_project_admin(auth.uid(), projeto_id));

DROP POLICY IF EXISTS "instrutor_turmas_admin_manage" ON public.instrutor_turmas;
CREATE POLICY "instrutor_turmas_admin_manage" ON public.instrutor_turmas
FOR ALL TO authenticated
USING (public.is_project_admin(auth.uid(), projeto_id))
WITH CHECK (public.is_project_admin(auth.uid(), projeto_id));