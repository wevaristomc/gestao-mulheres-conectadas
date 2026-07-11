DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evidencias'
  ) THEN
    ALTER TABLE public.evidencias ADD COLUMN IF NOT EXISTS arquivo_nome text;
  END IF;
END $$;