-- =====================================================================
-- Reforço de assertividade do leitor de listas de presença.
-- Aplique este SQL manualmente no projeto (SQL Editor).
-- Idempotente e retrocompatível.
-- =====================================================================

ALTER TABLE public.importacoes_presenca
  ADD COLUMN IF NOT EXISTS arquivo_hash text,
  ADD COLUMN IF NOT EXISTS confianca_media numeric,
  ADD COLUMN IF NOT EXISTS status_sugestao text NOT NULL DEFAULT 'sugerida'
    CHECK (status_sugestao IN ('sugerida','confirmada','rejeitada')),
  ADD COLUMN IF NOT EXISTS confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz;

-- Registros antigos (criados antes desta migração) contam como já confirmados.
UPDATE public.importacoes_presenca
SET status_sugestao = 'confirmada',
    confirmado_em = COALESCE(confirmado_em, criado_em)
WHERE arquivo_hash IS NULL
  AND confianca_media IS NULL
  AND status_sugestao = 'sugerida';

-- Um mesmo PDF (mesmo hash) não pode ficar com duas sugestões ativas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_importacoes_presenca_hash
  ON public.importacoes_presenca(arquivo_hash)
  WHERE arquivo_hash IS NOT NULL AND status_sugestao <> 'rejeitada';

-- Nova política de IA para 2ª passada de verificação.
INSERT INTO public.ia_politicas (processo, descricao, prioridade, provedor_preferido, max_tokens)
VALUES (
  'leitura_lista_verificacao',
  'Verificação (2ª passada) da leitura de lista de presença',
  'media',
  'gemini',
  4096
)
ON CONFLICT (processo) DO UPDATE SET
  descricao = EXCLUDED.descricao;