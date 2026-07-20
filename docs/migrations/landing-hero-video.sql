-- Vídeo de abertura gerenciável da landing Mulheres Conectadas.
-- Idempotente. Aplicar somente após autorização explícita.

CREATE TABLE IF NOT EXISTS public.landing_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_video_path text,
  hero_poster_path text,
  hero_video_som boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_landing_config_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS landing_config_atualizado_em ON public.landing_config;
CREATE TRIGGER landing_config_atualizado_em
  BEFORE UPDATE ON public.landing_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_landing_config_atualizado_em();

ALTER TABLE public.landing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_config_coord_select ON public.landing_config;
CREATE POLICY landing_config_coord_select
  ON public.landing_config
  FOR SELECT
  TO authenticated
  USING (
    public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  );

DROP POLICY IF EXISTS landing_config_coord_insert ON public.landing_config;
CREATE POLICY landing_config_coord_insert
  ON public.landing_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = 1
    AND public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  );

DROP POLICY IF EXISTS landing_config_coord_update ON public.landing_config;
CREATE POLICY landing_config_coord_update
  ON public.landing_config
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  )
  WITH CHECK (
    id = 1
    AND public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  );

DROP POLICY IF EXISTS landing_config_coord_delete ON public.landing_config;
CREATE POLICY landing_config_coord_delete
  ON public.landing_config
  FOR DELETE
  TO authenticated
  USING (
    public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  );

REVOKE ALL ON public.landing_config FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_config TO authenticated;

INSERT INTO public.landing_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing',
  'landing',
  true,
  52428800,
  ARRAY['video/mp4', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS landing_videos_public_select ON storage.objects;
CREATE POLICY landing_videos_public_select
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'landing');

DROP POLICY IF EXISTS landing_videos_coord_insert ON storage.objects;
CREATE POLICY landing_videos_coord_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'landing'
    AND lower(storage.extension(name)) IN ('mp4', 'jpg', 'jpeg', 'png')
    AND public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  );

DROP POLICY IF EXISTS landing_videos_coord_update ON storage.objects;
CREATE POLICY landing_videos_coord_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'landing'
    AND public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  )
  WITH CHECK (
    bucket_id = 'landing'
    AND lower(storage.extension(name)) IN ('mp4', 'jpg', 'jpeg', 'png')
    AND public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  );

DROP POLICY IF EXISTS landing_videos_coord_delete ON storage.objects;
CREATE POLICY landing_videos_coord_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'landing'
    AND public.has_role_any(
      auth.uid(),
      ARRAY['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
    )
  );

NOTIFY pgrst, 'reload schema';
