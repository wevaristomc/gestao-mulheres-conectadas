-- =====================================================================
-- Consolidado QAJBC — extensão Pedagógico / Administrativo / Relatórios
-- Rode APÓS docs/migrations/consolidado-qajbc.sql. Idempotente.
-- =====================================================================

-- 1. cursista_id em matriculas (para Pedagógico/Administrativo verem alunas)
ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS cursista_id uuid;

-- 2. Índice único parcial em cursistas por CPF (case/format-tolerante),
--    quando a tabela cursistas existir no schema public.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cursistas'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cursistas' AND column_name = 'cpf'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS cursistas_cpf_uidx
               ON public.cursistas ((regexp_replace(cpf, ''\D'', '''', ''g'')))
               WHERE cpf IS NOT NULL';
    END IF;
  END IF;
END $$;

-- 3. Índice único parcial em aulas por (turma_id, ordem) para permitir
--    upsert idempotente do esqueleto de aulas, quando a coluna ordem existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'aulas' AND column_name = 'ordem'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS aulas_turma_ordem_uidx
             ON public.aulas (turma_id, ordem)';
  END IF;
END $$;