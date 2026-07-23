-- Polos de inscrição gerenciáveis (idempotente)
create table if not exists public.polos_inscricao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  municipio text not null default '',
  endereco_referencia text,
  latitude numeric,
  longitude numeric,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists polos_inscricao_ativo_ordem_idx on public.polos_inscricao (ativo, ordem);
alter table public.polos_inscricao enable row level security;
drop policy if exists polos_inscricao_public_read on public.polos_inscricao;
create policy polos_inscricao_public_read on public.polos_inscricao for select using (ativo = true);
drop policy if exists polos_inscricao_coord_manage on public.polos_inscricao;
create policy polos_inscricao_coord_manage on public.polos_inscricao for all using (public.has_role_any(array['coordenador_geral','coordenador_pedagogico','administrativo'])) with check (public.has_role_any(array['coordenador_geral','coordenador_pedagogico','administrativo']));
insert into public.polos_inscricao (nome, municipio, ordem) values
 ('BH - Conjunto Santa Maria','Belo Horizonte',1),
 ('BH - Polo Barreiro','Belo Horizonte',2),
 ('BH - Polo Pedreira Lopes','Belo Horizonte',3),
 ('Juatuba - Cidade Satelite','Juatuba',4),
 ('Juatuba - SINE','Juatuba',5),
 ('Betim - SETER','Betim',6),
 ('Outros','',7)
on conflict do nothing;
notify pgrst, 'reload schema';
