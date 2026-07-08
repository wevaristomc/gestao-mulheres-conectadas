-- =====================================================================
-- Importação Consolidada QAJBC — colunas para professor titular na turma
-- Rode no projeto yqvocpnvunaprpmhlswn (SQL Editor). Idempotente.
-- =====================================================================

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS professor_nome  text,
  ADD COLUMN IF NOT EXISTS professor_email text;

-- Índice único parcial em codigo_turma (case-insensitive) para permitir
-- upsert seguro por código.
CREATE UNIQUE INDEX IF NOT EXISTS turmas_codigo_uidx
  ON public.turmas (upper(codigo_turma))
  WHERE codigo_turma IS NOT NULL;