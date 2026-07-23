-- Conteúdo textual editável da landing (idempotente)
alter table if exists public.landing_config add column if not exists conteudo jsonb;
notify pgrst, 'reload schema';
