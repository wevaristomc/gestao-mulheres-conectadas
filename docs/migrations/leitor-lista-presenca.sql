-- =====================================================================
-- Leitor de Listas de Presença Digitalizadas (OCR por IA)
-- Rode este SQL diretamente no projeto yqvocpnvunaprpmhlswn
-- (SQL Editor do Supabase). Uma única transação, idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.importacoes_presenca (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid REFERENCES public.turmas(id) ON DELETE SET NULL,
  aula_id uuid REFERENCES public.aulas(id) ON DELETE SET NULL,
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
  status text NOT NULL DEFAULT 'processando',
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.importacoes_presenca TO authenticated;
GRANT ALL ON public.importacoes_presenca TO service_role;

ALTER TABLE public.importacoes_presenca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "importacoes_presenca_all_staff" ON public.importacoes_presenca;
CREATE POLICY "importacoes_presenca_all_staff"
  ON public.importacoes_presenca
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_geral'::app_role)
    OR public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_pedagogico'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador_geral'::app_role)
    OR public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_pedagogico'::app_role)
  );

CREATE OR REPLACE FUNCTION public.set_updated_at_importacoes_presenca()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_importacoes_presenca_upd ON public.importacoes_presenca;
CREATE TRIGGER trg_importacoes_presenca_upd
  BEFORE UPDATE ON public.importacoes_presenca
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_importacoes_presenca();

-- Política de IA usada pelo roteador para OCR de listas de presença.
INSERT INTO public.ia_politicas (processo, descricao, prioridade, provedor_preferido, max_tokens)
VALUES ('leitura_lista_presenca', 'OCR de lista de presença escaneada', 'media', 'gemini', 8192)
ON CONFLICT (processo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  provedor_preferido = COALESCE(public.ia_politicas.provedor_preferido, EXCLUDED.provedor_preferido),
  max_tokens = GREATEST(public.ia_politicas.max_tokens, EXCLUDED.max_tokens);