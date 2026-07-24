create table if not exists public.inscricao_perguntas_customizadas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  label text not null,
  tipo text not null check (tipo in ('texto_curto','texto_longo','selecao_unica','selecao_multipla','sim_nao','numero','data')),
  opcoes jsonb not null default '[]'::jsonb,
  obrigatoria boolean not null default false,
  ajuda text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.inscricao_perguntas_customizadas enable row level security;
drop policy if exists inscricao_perguntas_public_read on public.inscricao_perguntas_customizadas;
create policy inscricao_perguntas_public_read on public.inscricao_perguntas_customizadas for select using (ativo = true);
drop policy if exists inscricao_perguntas_coord_manage on public.inscricao_perguntas_customizadas;
create policy inscricao_perguntas_coord_manage on public.inscricao_perguntas_customizadas for all using (public.has_role_any(auth.uid(), array['coordenador_geral','coordenador_pedagogico','administrativo'])) with check (public.has_role_any(auth.uid(), array['coordenador_geral','coordenador_pedagogico','administrativo']));
notify pgrst, 'reload schema';
