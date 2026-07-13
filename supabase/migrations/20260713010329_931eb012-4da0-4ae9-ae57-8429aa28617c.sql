CREATE TABLE IF NOT EXISTS public.permissoes_papel (
  role public.app_role NOT NULL,
  modulo text NOT NULL,
  pode_ver boolean NOT NULL DEFAULT false,
  pode_criar boolean NOT NULL DEFAULT false,
  pode_editar boolean NOT NULL DEFAULT false,
  pode_excluir boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, modulo)
);

GRANT SELECT ON public.permissoes_papel TO authenticated;
GRANT ALL ON public.permissoes_papel TO service_role;

ALTER TABLE public.permissoes_papel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permissoes_papel_authenticated_read" ON public.permissoes_papel;
CREATE POLICY "permissoes_papel_authenticated_read"
ON public.permissoes_papel
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.tg_permissoes_papel_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permissoes_papel_atualizado_em ON public.permissoes_papel;
CREATE TRIGGER trg_permissoes_papel_atualizado_em
BEFORE UPDATE ON public.permissoes_papel
FOR EACH ROW
EXECUTE FUNCTION public.tg_permissoes_papel_atualizado_em();

INSERT INTO public.permissoes_papel (role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir)
VALUES
  ('coordenador_geral', 'visao-geral', true, true, true, true),
  ('coordenador_geral', 'pendencias', true, true, true, true),
  ('coordenador_geral', 'pedagogico', true, true, true, true),
  ('coordenador_geral', 'mte', true, true, true, true),
  ('coordenador_geral', 'administrativo', true, true, true, true),
  ('coordenador_geral', 'financeiro', true, true, true, true),
  ('coordenador_geral', 'captacao', true, true, true, true),
  ('coordenador_geral', 'relatorios', true, true, true, true),
  ('coordenador_geral', 'whatsapp', true, true, true, true),
  ('coordenador_geral', 'base-conhecimento', true, true, true, true),
  ('coordenador_geral', 'drive', true, true, true, true),
  ('coordenador_geral', 'relacao-horas', true, true, true, true),
  ('coordenador_geral', 'financeiro-relacoes-horas', true, true, true, true),
  ('coordenador_geral', 'etapas', true, true, true, true),
  ('coordenador_geral', 'ajuda', true, true, true, true),
  ('coordenador_geral', 'configuracoes', true, true, true, true),

  ('administrativo', 'visao-geral', true, true, true, false),
  ('administrativo', 'pendencias', true, true, true, false),
  ('administrativo', 'pedagogico', true, true, true, false),
  ('administrativo', 'mte', true, true, true, false),
  ('administrativo', 'administrativo', true, true, true, false),
  ('administrativo', 'financeiro', true, true, true, false),
  ('administrativo', 'captacao', true, true, true, false),
  ('administrativo', 'relatorios', true, false, false, false),
  ('administrativo', 'whatsapp', true, true, true, false),
  ('administrativo', 'base-conhecimento', true, true, true, false),
  ('administrativo', 'drive', true, true, true, false),
  ('administrativo', 'relacao-horas', true, true, true, false),
  ('administrativo', 'financeiro-relacoes-horas', true, true, true, false),
  ('administrativo', 'etapas', true, true, true, false),
  ('administrativo', 'ajuda', true, false, false, false),
  ('administrativo', 'configuracoes', true, true, true, false),

  ('coordenador_pedagogico', 'visao-geral', true, true, true, false),
  ('coordenador_pedagogico', 'pendencias', true, true, true, false),
  ('coordenador_pedagogico', 'pedagogico', true, true, true, false),
  ('coordenador_pedagogico', 'mte', true, true, true, false),
  ('coordenador_pedagogico', 'captacao', true, true, true, false),
  ('coordenador_pedagogico', 'relatorios', true, false, false, false),
  ('coordenador_pedagogico', 'whatsapp', true, true, true, false),
  ('coordenador_pedagogico', 'base-conhecimento', true, true, true, false),
  ('coordenador_pedagogico', 'drive', true, true, true, false),
  ('coordenador_pedagogico', 'etapas', true, true, true, false),
  ('coordenador_pedagogico', 'ajuda', true, false, false, false),

  ('gestor_financeiro', 'administrativo', true, false, false, false),
  ('gestor_financeiro', 'financeiro', true, true, true, false),
  ('gestor_financeiro', 'relatorios', true, false, false, false),
  ('gestor_financeiro', 'financeiro-relacoes-horas', true, true, true, false),
  ('gestor_financeiro', 'ajuda', true, false, false, false),

  ('professor', 'pedagogico', true, true, true, false),
  ('professor', 'mte', true, false, false, false),
  ('professor', 'relacao-horas', true, true, true, false),
  ('professor', 'ajuda', true, false, false, false),

  ('auxiliar_pedagogico', 'pedagogico', true, true, true, false),
  ('auxiliar_pedagogico', 'mte', true, false, false, false),
  ('auxiliar_pedagogico', 'relacao-horas', true, true, true, false),
  ('auxiliar_pedagogico', 'ajuda', true, false, false, false)
ON CONFLICT (role, modulo) DO UPDATE
SET
  pode_ver = EXCLUDED.pode_ver,
  pode_criar = EXCLUDED.pode_criar,
  pode_editar = EXCLUDED.pode_editar,
  pode_excluir = EXCLUDED.pode_excluir;
