-- =====================================================================
-- Anexo de comprovação por aula — versão canônica (idempotente)
-- Já aplicado manualmente no projeto REAL (yqvocpnvunaprpmhlswn).
-- Este arquivo existe como referência histórica.
-- =====================================================================

ALTER TABLE public.evidencias
  ADD COLUMN IF NOT EXISTS aula_id uuid REFERENCES public.aulas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_evidencias_aula_id
  ON public.evidencias(aula_id);
CREATE INDEX IF NOT EXISTS idx_evidencias_turma_tipo
  ON public.evidencias(turma_id, tipo);
CREATE INDEX IF NOT EXISTS idx_evidencias_enviado_por
  ON public.evidencias(enviado_por);

-- Observação: enum public.tipo_evidencia já inclui 'lista_presenca' e
-- 'registro_fotografico'. Bucket `evidencias` já existe.