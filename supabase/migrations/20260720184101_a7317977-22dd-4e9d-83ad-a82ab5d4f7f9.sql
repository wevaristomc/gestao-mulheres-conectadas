
-- Depoimentos da landing: tabela + RLS + políticas de storage
CREATE TABLE IF NOT EXISTS public.landing_depoimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  contexto text NOT NULL,
  video_path text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS landing_depoimentos_video_path_uniq
  ON public.landing_depoimentos (video_path);
CREATE INDEX IF NOT EXISTS landing_depoimentos_ativo_ordem_idx
  ON public.landing_depoimentos (ativo, ordem);

CREATE OR REPLACE FUNCTION public.set_landing_depoimentos_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS landing_depoimentos_atualizado_em ON public.landing_depoimentos;
CREATE TRIGGER landing_depoimentos_atualizado_em
  BEFORE UPDATE ON public.landing_depoimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_landing_depoimentos_atualizado_em();

REVOKE ALL ON public.landing_depoimentos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_depoimentos TO authenticated;
GRANT ALL ON public.landing_depoimentos TO service_role;

ALTER TABLE public.landing_depoimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_depoimentos_coord_select ON public.landing_depoimentos;
CREATE POLICY landing_depoimentos_coord_select ON public.landing_depoimentos
  FOR SELECT TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

DROP POLICY IF EXISTS landing_depoimentos_coord_insert ON public.landing_depoimentos;
CREATE POLICY landing_depoimentos_coord_insert ON public.landing_depoimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

DROP POLICY IF EXISTS landing_depoimentos_coord_update ON public.landing_depoimentos;
CREATE POLICY landing_depoimentos_coord_update ON public.landing_depoimentos
  FOR UPDATE TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']))
  WITH CHECK (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

DROP POLICY IF EXISTS landing_depoimentos_coord_delete ON public.landing_depoimentos;
CREATE POLICY landing_depoimentos_coord_delete ON public.landing_depoimentos
  FOR DELETE TO authenticated
  USING (public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

-- Seed com os depoimentos estáticos existentes
INSERT INTO public.landing_depoimentos (nome, contexto, video_path, ordem, ativo)
VALUES
  ('Andressa', 'Aluna · Juatuba · Tarde', '/depoimentos/andressa-juatuba-tarde.mp4', 1, true),
  ('Camila', 'Aluna do projeto', '/depoimentos/camila.mp4', 2, true),
  ('Deisiane', 'Aluna do projeto', '/depoimentos/deisiane.mp4', 3, true),
  ('Elisangela', 'Aluna do projeto', '/depoimentos/elisangela.mp4', 4, true),
  ('Ivete', 'Aluna do projeto', '/depoimentos/ivete.mp4', 5, true)
ON CONFLICT (video_path) DO UPDATE
SET nome = EXCLUDED.nome, contexto = EXCLUDED.contexto, ordem = EXCLUDED.ordem;

-- Políticas do bucket 'landing' (privado): leitura pela service role/admin; escrita pelos papéis de gestão
DROP POLICY IF EXISTS landing_videos_coord_select ON storage.objects;
CREATE POLICY landing_videos_coord_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'landing');

DROP POLICY IF EXISTS landing_videos_coord_insert ON storage.objects;
CREATE POLICY landing_videos_coord_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'landing'
    AND lower(storage.extension(name)) = 'mp4'
    AND public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo'])
  );

DROP POLICY IF EXISTS landing_videos_coord_update ON storage.objects;
CREATE POLICY landing_videos_coord_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'landing' AND public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']))
  WITH CHECK (bucket_id = 'landing' AND public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

DROP POLICY IF EXISTS landing_videos_coord_delete ON storage.objects;
CREATE POLICY landing_videos_coord_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'landing' AND public.has_role_any(auth.uid(), ARRAY['coordenador_geral','coordenador_pedagogico','administrativo']));

NOTIFY pgrst, 'reload schema';
