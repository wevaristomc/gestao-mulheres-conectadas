-- Pasta individual da cursista no Google Drive
-- Idempotente: pode ser executada mais de uma vez.

alter table if exists public.cursistas
  add column if not exists pasta_drive_id text,
  add column if not exists pasta_drive_url text;

comment on column public.cursistas.pasta_drive_id is
  'ID da pasta individual da cursista no Google Drive.';

comment on column public.cursistas.pasta_drive_url is
  'Link de visualizacao da pasta individual da cursista no Google Drive.';

create index if not exists cursistas_pasta_drive_id_idx
  on public.cursistas (pasta_drive_id)
  where pasta_drive_id is not null;

notify pgrst, 'reload schema';
