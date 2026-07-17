
-- =========================================
-- FORNECEDORES
-- =========================================
CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cnpj text,
  email text,
  telefone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fornecedores_projeto_id_idx ON public.fornecedores(projeto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT ALL ON public.fornecedores TO service_role;

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fornecedores_select_project_members" ON public.fornecedores
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.projeto_id = fornecedores.projeto_id OR ur.projeto_id IS NULL)
        AND COALESCE(ur.ativo, true) = true
    )
  );

CREATE POLICY "fornecedores_write_financeiro" ON public.fornecedores
  FOR ALL TO authenticated
  USING (public.is_project_admin(auth.uid(), fornecedores.projeto_id))
  WITH CHECK (public.is_project_admin(auth.uid(), fornecedores.projeto_id));

CREATE TRIGGER trg_fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- ORCAMENTO_ITENS
-- =========================================
CREATE TABLE public.orcamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  categoria text,
  descricao text,
  valor_previsto numeric NOT NULL DEFAULT 0,
  valor_executado numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orcamento_itens_projeto_id_idx ON public.orcamento_itens(projeto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamento_itens TO authenticated;
GRANT ALL ON public.orcamento_itens TO service_role;

ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orcamento_itens_select_project_members" ON public.orcamento_itens
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.projeto_id = orcamento_itens.projeto_id OR ur.projeto_id IS NULL)
        AND COALESCE(ur.ativo, true) = true
    )
  );

CREATE POLICY "orcamento_itens_write_financeiro" ON public.orcamento_itens
  FOR ALL TO authenticated
  USING (public.is_project_admin(auth.uid(), orcamento_itens.projeto_id))
  WITH CHECK (public.is_project_admin(auth.uid(), orcamento_itens.projeto_id));

CREATE TRIGGER trg_orcamento_itens_updated_at
  BEFORE UPDATE ON public.orcamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- DESPESAS
-- =========================================
CREATE TABLE public.despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  descricao text,
  valor numeric NOT NULL DEFAULT 0,
  data date,
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  orcamento_item_id uuid REFERENCES public.orcamento_itens(id) ON DELETE SET NULL,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX despesas_projeto_id_idx ON public.despesas(projeto_id);
CREATE INDEX despesas_fornecedor_id_idx ON public.despesas(fornecedor_id);
CREATE INDEX despesas_orcamento_item_id_idx ON public.despesas(orcamento_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas TO authenticated;
GRANT ALL ON public.despesas TO service_role;

ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "despesas_select_project_members" ON public.despesas
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.projeto_id = despesas.projeto_id OR ur.projeto_id IS NULL)
        AND COALESCE(ur.ativo, true) = true
    )
  );

CREATE POLICY "despesas_write_financeiro" ON public.despesas
  FOR ALL TO authenticated
  USING (public.is_project_admin(auth.uid(), despesas.projeto_id))
  WITH CHECK (public.is_project_admin(auth.uid(), despesas.projeto_id));

CREATE TRIGGER trg_despesas_updated_at
  BEFORE UPDATE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- RUBRICAS
-- =========================================
CREATE TABLE public.rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  codigo text,
  nome text,
  categoria text,
  valor_previsto numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rubricas_projeto_id_idx ON public.rubricas(projeto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubricas TO authenticated;
GRANT ALL ON public.rubricas TO service_role;

ALTER TABLE public.rubricas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rubricas_select_project_members" ON public.rubricas
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.projeto_id = rubricas.projeto_id OR ur.projeto_id IS NULL)
        AND COALESCE(ur.ativo, true) = true
    )
  );

CREATE POLICY "rubricas_write_financeiro" ON public.rubricas
  FOR ALL TO authenticated
  USING (public.is_project_admin(auth.uid(), rubricas.projeto_id))
  WITH CHECK (public.is_project_admin(auth.uid(), rubricas.projeto_id));

CREATE TRIGGER trg_rubricas_updated_at
  BEFORE UPDATE ON public.rubricas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
