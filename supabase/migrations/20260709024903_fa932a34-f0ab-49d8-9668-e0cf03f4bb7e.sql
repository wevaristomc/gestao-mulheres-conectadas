CREATE TABLE IF NOT EXISTS public.importacoes_presenca (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid,
  aula_id uuid,
  arquivo_url text,
  arquivo_nome text,
  data_aula date,
  conteudo text,
  instrutor text,
  horario text,
  ch_dia numeric,
  turma_identificada text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  nao_identificados jsonb NOT NULL DEFAULT '[]'::jsonb,
  avisos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'concluida',
  revisao_status text NOT NULL DEFAULT 'em_analise',
  revisao_por uuid REFERENCES auth.users(id),
  revisao_em timestamptz,
  revisao_observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT importacoes_presenca_revisao_status_chk
    CHECK (revisao_status IN ('em_analise','verificado','reanalise_solicitada'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.importacoes_presenca TO authenticated;
GRANT ALL ON public.importacoes_presenca TO service_role;

ALTER TABLE public.importacoes_presenca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth users manage importacoes_presenca" ON public.importacoes_presenca;
CREATE POLICY "auth users manage importacoes_presenca"
  ON public.importacoes_presenca
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS importacoes_presenca_turma_idx ON public.importacoes_presenca (turma_id);
CREATE INDEX IF NOT EXISTS importacoes_presenca_criado_idx ON public.importacoes_presenca (criado_em DESC);