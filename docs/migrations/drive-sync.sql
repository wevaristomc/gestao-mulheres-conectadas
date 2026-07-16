-- ============================================================================
-- SINCRONIZAÇÃO GOOGLE DRIVE → BASE DE CONHECIMENTO
-- Cria estado da varredura, catálogo de arquivos do Drive e ia_politicas
-- específicas para OCR e transcrição do Drive. Idempotente.
-- Depende de: has_role_any() (docs/migrations/rbac-e-relacao-horas.sql) e
-- da tabela `documentos` (base-conhecimento) + `ia_politicas` (ia).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Estado da varredura (uma única linha "singleton").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drive_sync_estado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ultima_varredura timestamptz,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drive_sync_estado TO authenticated;
GRANT ALL ON public.drive_sync_estado TO service_role;

ALTER TABLE public.drive_sync_estado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drive_sync_estado_read ON public.drive_sync_estado;
CREATE POLICY drive_sync_estado_read ON public.drive_sync_estado
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS drive_sync_estado_write ON public.drive_sync_estado;
CREATE POLICY drive_sync_estado_write ON public.drive_sync_estado
  FOR ALL TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']));

-- ---------------------------------------------------------------------------
-- 2) Catálogo de arquivos indexados a partir do Drive.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drive_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gdrive_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  mime_type text,
  tamanho bigint,
  modified_time timestamptz,
  pasta_caminho text,
  tipo text NOT NULL DEFAULT 'outro',
    -- texto | pdf | docx | planilha | imagem | audio | video | gdoc | outro
  status text NOT NULL DEFAULT 'pendente',
    -- pendente | processando | indexado | erro | ignorado | aguardando_selecao
  transcrever boolean NOT NULL DEFAULT false,
  erro text,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  processado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drive_arquivos_status_idx ON public.drive_arquivos(status);
CREATE INDEX IF NOT EXISTS drive_arquivos_tipo_idx ON public.drive_arquivos(tipo);
CREATE INDEX IF NOT EXISTS drive_arquivos_modified_idx ON public.drive_arquivos(modified_time DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drive_arquivos TO authenticated;
GRANT ALL ON public.drive_arquivos TO service_role;

ALTER TABLE public.drive_arquivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drive_arquivos_read ON public.drive_arquivos;
CREATE POLICY drive_arquivos_read ON public.drive_arquivos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS drive_arquivos_write ON public.drive_arquivos;
CREATE POLICY drive_arquivos_write ON public.drive_arquivos
  FOR ALL TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','coordenador_pedagogico']));

-- trigger de atualizado_em
CREATE OR REPLACE FUNCTION public.tg_touch_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drive_arquivos_touch ON public.drive_arquivos;
CREATE TRIGGER trg_drive_arquivos_touch
  BEFORE UPDATE ON public.drive_arquivos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_atualizado_em();

DROP TRIGGER IF EXISTS trg_drive_sync_estado_touch ON public.drive_sync_estado;
CREATE TRIGGER trg_drive_sync_estado_touch
  BEFORE UPDATE ON public.drive_sync_estado
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_atualizado_em();

-- ---------------------------------------------------------------------------
-- 3) Políticas de IA para OCR e transcrição vindas do Drive.
-- ---------------------------------------------------------------------------
INSERT INTO public.ia_politicas (processo, descricao, complexidade, provedor_preferido, max_tokens, temperatura, usar_fallback)
VALUES
  ('drive_ocr', 'OCR/visão de páginas de PDFs escaneados e imagens vindas do Google Drive.', 'media', 'gemini', 4096, 0.1, true),
  ('drive_transcricao', 'Transcrição de áudios e vídeos curtos vindos do Google Drive (Whisper).', 'media', 'openai', 2048, 0.1, true)
ON CONFLICT (processo) DO NOTHING;

COMMIT;

-- ============================================================================
-- APPEND (2026-07-16): backoff de re-tentativa quando a cota da IA estoura.
-- Sync do Drive passa a marcar drive_arquivos.tentativas + proxima_tentativa em
-- vez de status='erro' quando o roteador de visão/transcrição responde 429.
-- ============================================================================
ALTER TABLE public.drive_arquivos
  ADD COLUMN IF NOT EXISTS tentativas int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proxima_tentativa timestamptz;

CREATE INDEX IF NOT EXISTS drive_arquivos_proxima_tentativa_idx
  ON public.drive_arquivos(proxima_tentativa)
  WHERE proxima_tentativa IS NOT NULL;