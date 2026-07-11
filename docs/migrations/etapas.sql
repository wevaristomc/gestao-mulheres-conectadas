-- ============================================================================
-- Módulo: Gestão de Etapas do Projeto
-- Aplicar manualmente no banco real. Idempotente.
-- ============================================================================

-- 1) Tabelas ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  titulo text NOT NULL,
  descricao text,
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'planejada'
    CHECK (status IN ('planejada','em_andamento','concluida','prestacao_contas')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projeto_id, numero)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.etapas TO authenticated;
GRANT ALL ON public.etapas TO service_role;

ALTER TABLE public.etapas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS etapas_select ON public.etapas;
CREATE POLICY etapas_select ON public.etapas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS etapas_write ON public.etapas;
CREATE POLICY etapas_write ON public.etapas
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_geral'::app_role) OR
    public.has_role(auth.uid(), 'administrativo'::app_role) OR
    public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador_geral'::app_role) OR
    public.has_role(auth.uid(), 'administrativo'::app_role) OR
    public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.etapa_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL REFERENCES public.etapas(id) ON DELETE CASCADE,
  grupo text NOT NULL,
  titulo text NOT NULL,
  descricao text,
  responsavel text,
  prazo date,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_andamento','concluida','bloqueada')),
  ordem integer NOT NULL DEFAULT 0,
  vinculo_modulo text,
  concluida_em timestamptz,
  concluida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS etapa_atividades_uk
  ON public.etapa_atividades (etapa_id, titulo);
CREATE INDEX IF NOT EXISTS etapa_atividades_etapa_idx ON public.etapa_atividades(etapa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.etapa_atividades TO authenticated;
GRANT ALL ON public.etapa_atividades TO service_role;

ALTER TABLE public.etapa_atividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS etapa_atividades_select ON public.etapa_atividades;
CREATE POLICY etapa_atividades_select ON public.etapa_atividades
  FOR SELECT TO authenticated USING (true);

-- Autenticados podem atualizar apenas status/concluida_em/concluida_por.
-- Regras estruturais (insert/delete/update de outros campos) restritas à coordenação.
DROP POLICY IF EXISTS etapa_atividades_update_status ON public.etapa_atividades;
CREATE POLICY etapa_atividades_update_status ON public.etapa_atividades
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS etapa_atividades_insert ON public.etapa_atividades;
CREATE POLICY etapa_atividades_insert ON public.etapa_atividades
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador_geral'::app_role) OR
    public.has_role(auth.uid(), 'administrativo'::app_role) OR
    public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
  );

DROP POLICY IF EXISTS etapa_atividades_delete ON public.etapa_atividades;
CREATE POLICY etapa_atividades_delete ON public.etapa_atividades
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_geral'::app_role) OR
    public.has_role(auth.uid(), 'administrativo'::app_role) OR
    public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
  );

-- Trigger atualizado_em
CREATE OR REPLACE FUNCTION public.tg_touch_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS etapas_touch ON public.etapas;
CREATE TRIGGER etapas_touch BEFORE UPDATE ON public.etapas
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_atualizado_em();

DROP TRIGGER IF EXISTS etapa_atividades_touch ON public.etapa_atividades;
CREATE TRIGGER etapa_atividades_touch BEFORE UPDATE ON public.etapa_atividades
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_atualizado_em();

-- 2) Seed de LOCAIS (novos polos) --------------------------------------------

INSERT INTO public.locais (nome, municipio)
SELECT v.nome, v.municipio FROM (VALUES
  ('Pedreira Padre Lopes', 'Betim'),
  ('Acabamundo', 'Betim'),
  ('SINE Betim', 'Betim'),
  ('SINE Juatuba', 'Juatuba'),
  ('Citrolândia', 'Betim'),
  ('Mariana', 'Betim'),
  ('Edvalda', 'Betim')
) AS v(nome, municipio)
WHERE NOT EXISTS (
  SELECT 1 FROM public.locais l WHERE l.nome = v.nome
);

-- 3) Seed das etapas ---------------------------------------------------------

DO $seed$
DECLARE
  proj uuid;
  et1 uuid;
  et2 uuid;
BEGIN
  SELECT id INTO proj FROM public.projetos ORDER BY criado_em NULLS LAST, nome LIMIT 1;

  -- Etapa 1
  INSERT INTO public.etapas (projeto_id, numero, titulo, descricao, data_inicio, data_fim, status)
  VALUES (proj, 1,
    '1ª Etapa — Execução Ciclo 1 (6 turmas Betim/Juatuba)',
    'Execução da 1ª etapa do Termo de Fomento — 6 turmas em Betim e Juatuba.',
    '2026-05-09', '2026-07-31', 'prestacao_contas')
  ON CONFLICT (projeto_id, numero) DO UPDATE
    SET titulo = EXCLUDED.titulo,
        descricao = EXCLUDED.descricao,
        data_inicio = EXCLUDED.data_inicio,
        data_fim = EXCLUDED.data_fim,
        status = EXCLUDED.status
  RETURNING id INTO et1;

  -- Etapa 2
  INSERT INTO public.etapas (projeto_id, numero, titulo, descricao, data_inicio, data_fim, status)
  VALUES (proj, 2,
    '2ª Etapa — Preparação e Matrículas Ciclo 2',
    'Proposta TransfereGov 058916/2025. Cursos Programadora Web e Técnica em Suporte de TI (150h — 40h básicos + 110h específicos, CODEFAT 995/2024). Meta total: 600 beneficiárias.',
    '2026-07-21', '2026-09-05', 'em_andamento')
  ON CONFLICT (projeto_id, numero) DO UPDATE
    SET titulo = EXCLUDED.titulo,
        descricao = EXCLUDED.descricao,
        data_inicio = EXCLUDED.data_inicio,
        data_fim = EXCLUDED.data_fim,
        status = EXCLUDED.status
  RETURNING id INTO et2;

  -- Atividades Etapa 2 (idempotente por etapa_id+titulo)
  INSERT INTO public.etapa_atividades (etapa_id, grupo, titulo, descricao, prazo, ordem, vinculo_modulo)
  VALUES
    -- Administração
    (et2, 'Administração', 'Elaborar Plano de Trabalho da 2ª etapa', NULL, '2026-07-25', 10, NULL),
    (et2, 'Administração', 'Atualizar cronograma de execução', NULL, '2026-07-25', 20, NULL),
    (et2, 'Administração', 'Definir datas de início das turmas', NULL, '2026-07-30', 30, NULL),
    (et2, 'Administração', 'Organizar documentação para prestação de contas da 1ª etapa', NULL, '2026-08-04', 40, NULL),
    (et2, 'Administração', 'Organizar documentação administrativa dos contratados', NULL, '2026-08-02', 50, NULL),
    (et2, 'Administração', 'Reunião de alinhamento e distribuição de atividades', NULL, '2026-07-21', 60, NULL),
    -- Orçamentos
    (et2, 'Orçamentos', 'Gráfica — cotação 1', NULL, '2026-07-28', 110, 'cotacoes'),
    (et2, 'Orçamentos', 'Gráfica — cotação 2', NULL, '2026-07-28', 111, 'cotacoes'),
    (et2, 'Orçamentos', 'Gráfica — cotação 3', NULL, '2026-07-28', 112, 'cotacoes'),
    (et2, 'Orçamentos', 'Professores — cotação 1', NULL, '2026-07-28', 120, 'cotacoes'),
    (et2, 'Orçamentos', 'Professores — cotação 2', NULL, '2026-07-28', 121, 'cotacoes'),
    (et2, 'Orçamentos', 'Professores — cotação 3', NULL, '2026-07-28', 122, 'cotacoes'),
    (et2, 'Orçamentos', 'Coordenação Pedagógica — cotação 1', NULL, '2026-07-28', 130, 'cotacoes'),
    (et2, 'Orçamentos', 'Coordenação Pedagógica — cotação 2', NULL, '2026-07-28', 131, 'cotacoes'),
    (et2, 'Orçamentos', 'Coordenação Pedagógica — cotação 3', NULL, '2026-07-28', 132, 'cotacoes'),
    (et2, 'Orçamentos', 'Motorista — cotação 1', NULL, '2026-07-28', 140, 'cotacoes'),
    (et2, 'Orçamentos', 'Motorista — cotação 2', NULL, '2026-07-28', 141, 'cotacoes'),
    (et2, 'Orçamentos', 'Motorista — cotação 3', NULL, '2026-07-28', 142, 'cotacoes'),
    (et2, 'Orçamentos', 'Locação de veículo — cotação 1', NULL, '2026-07-28', 150, 'cotacoes'),
    (et2, 'Orçamentos', 'Locação de veículo — cotação 2', NULL, '2026-07-28', 151, 'cotacoes'),
    (et2, 'Orçamentos', 'Locação de veículo — cotação 3', NULL, '2026-07-28', 152, 'cotacoes'),
    (et2, 'Orçamentos', 'Aprovar orçamentos', NULL, '2026-08-04', 160, 'cotacoes'),
    -- Contratações
    (et2, 'Contratações', 'Confirmar contratação dos professores', NULL, '2026-07-30', 210, NULL),
    (et2, 'Contratações', 'Confirmar coordenação pedagógica', NULL, '2026-07-30', 220, NULL),
    (et2, 'Contratações', 'Confirmar motorista', NULL, '2026-07-30', 230, NULL),
    (et2, 'Contratações', 'Confirmar locação do veículo', NULL, '2026-07-30', 240, NULL),
    (et2, 'Contratações', 'Validar contratos', NULL, '2026-08-04', 250, NULL),
    -- Infraestrutura (7 polos, total 10 professores)
    (et2, 'Infraestrutura', 'Visitas técnicas aos 7 polos', 'Pedreira Padre Lopes — 2 professor(es); Acabamundo — 2 professor(es); SINE Betim — 1 professor(es); SINE Juatuba — 1 professor(es); Citrolândia — 1 professor(es); Mariana — 2 professor(es); Edvalda — 1 professor(es). Total: 10 professores.', '2026-08-01', 310, 'locais'),
    (et2, 'Infraestrutura', 'Levantamento de computadores por laboratório', 'Quantidade, estado de conservação, manutenção necessária, softwares instalados.', '2026-08-01', 320, 'locais'),
    (et2, 'Infraestrutura', 'Verificar internet', NULL, '2026-08-01', 330, 'locais'),
    (et2, 'Infraestrutura', 'Verificar energia elétrica e segurança', NULL, '2026-08-01', 340, 'locais'),
    (et2, 'Infraestrutura', 'Verificar acessibilidade e espaço das salas', NULL, '2026-08-01', 350, 'locais'),
    (et2, 'Infraestrutura', 'Verificar equipamentos de apoio — projetor/tela', NULL, '2026-08-01', 360, 'locais'),
    (et2, 'Infraestrutura', 'Definir cronograma das visitas técnicas', NULL, '2026-07-24', 370, 'locais'),
    -- AVA
    (et2, 'AVA', 'Configurar o AVA', NULL, '2026-08-02', 410, 'ava'),
    (et2, 'AVA', 'Cadastrar professores no AVA', NULL, '2026-08-02', 420, 'ava'),
    (et2, 'AVA', 'Cadastrar turmas no AVA', NULL, '2026-08-02', 430, 'ava'),
    (et2, 'AVA', 'Inserir materiais didáticos', NULL, '2026-08-02', 440, 'ava'),
    (et2, 'AVA', 'Testar acesso dos alunos', NULL, '2026-08-02', 450, 'ava'),
    -- Materiais
    (et2, 'Materiais', 'Preparar material gráfico', NULL, '2026-08-02', 510, NULL),
    (et2, 'Materiais', 'Planejar entrega dos kits às alunas', NULL, '2026-08-04', 520, NULL),
    -- Encerramento preparação
    (et2, 'Encerramento preparação', 'Conferência final das pendências', NULL, '2026-08-04', 610, 'pendencias'),
    (et2, 'Encerramento preparação', 'Confirmar locais das aulas', NULL, '2026-08-04', 620, 'locais'),
    (et2, 'Encerramento preparação', 'Definir cronograma de acompanhamento das turmas', NULL, '2026-08-04', 630, NULL),
    -- Matrículas (05/08 a 05/09)
    (et2, 'Matrículas', 'Divulgação das turmas', 'Período: 05/08 a 05/09.', '2026-08-10', 710, NULL),
    (et2, 'Matrículas', 'Recebimento das inscrições', 'Período: 05/08 a 05/09.', '2026-09-05', 720, NULL),
    (et2, 'Matrículas', 'Atendimento aos candidatos', 'Período: 05/08 a 05/09.', '2026-09-05', 730, NULL),
    (et2, 'Matrículas', 'Conferência da documentação', NULL, '2026-09-05', 740, NULL),
    (et2, 'Matrículas', 'Efetivação das matrículas', NULL, '2026-09-05', 750, NULL),
    (et2, 'Matrículas', 'Organização das listas de alunas', NULL, '2026-09-05', 760, NULL),
    (et2, 'Matrículas', 'Formação das turmas', NULL, '2026-09-05', 770, NULL),
    (et2, 'Matrículas', 'Encaminhamento das alunas ao AVA', NULL, '2026-09-05', 780, 'ava'),
    (et2, 'Matrículas', 'Preparação do início das atividades', NULL, '2026-09-05', 790, NULL)
  ON CONFLICT (etapa_id, titulo) DO UPDATE
    SET grupo = EXCLUDED.grupo,
        prazo = EXCLUDED.prazo,
        ordem = EXCLUDED.ordem,
        vinculo_modulo = EXCLUDED.vinculo_modulo,
        descricao = COALESCE(EXCLUDED.descricao, public.etapa_atividades.descricao);
END $seed$;