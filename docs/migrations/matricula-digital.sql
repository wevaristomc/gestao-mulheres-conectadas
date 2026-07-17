-- Fila unica das inscricoes recebidas pelo formulario publico e pelo OCR.
-- Idempotente: pode ser reexecutada sem duplicar tabela, indices, trigger ou policies.

begin;

create table if not exists public.inscricoes_digitais (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  turma_id uuid references public.turmas(id) on delete set null,
  origem text not null default 'formulario',
  status text not null default 'pendente',
  dados jsonb not null default '{}'::jsonb,
  arquivo_origem_path text,
  confianca_ocr numeric,
  cursista_id uuid references public.cursistas(id) on delete set null,
  revisado_por uuid,
  revisado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes_digitais'::regclass
      and conname = 'inscricoes_digitais_origem_check'
  ) then
    alter table public.inscricoes_digitais
      add constraint inscricoes_digitais_origem_check
      check (origem in ('formulario', 'ocr'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes_digitais'::regclass
      and conname = 'inscricoes_digitais_status_check'
  ) then
    alter table public.inscricoes_digitais
      add constraint inscricoes_digitais_status_check
      check (status in ('pendente', 'em_revisao', 'aprovada', 'rejeitada', 'duplicada'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes_digitais'::regclass
      and conname = 'inscricoes_digitais_confianca_check'
  ) then
    alter table public.inscricoes_digitais
      add constraint inscricoes_digitais_confianca_check
      check (confianca_ocr is null or (confianca_ocr >= 0 and confianca_ocr <= 1));
  end if;
end
$constraints$;

create index if not exists inscricoes_digitais_projeto_status_idx
  on public.inscricoes_digitais (projeto_id, status, criado_em desc);
create index if not exists inscricoes_digitais_turma_idx
  on public.inscricoes_digitais (turma_id);
create index if not exists inscricoes_digitais_cursista_idx
  on public.inscricoes_digitais (cursista_id);
create index if not exists inscricoes_digitais_cpf_idx
  on public.inscricoes_digitais ((dados ->> 'cpf'));

create or replace function public.set_inscricoes_digitais_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_inscricoes_digitais_atualizado_em on public.inscricoes_digitais;
create trigger trg_inscricoes_digitais_atualizado_em
before update on public.inscricoes_digitais
for each row execute function public.set_inscricoes_digitais_atualizado_em();

alter table public.inscricoes_digitais enable row level security;

drop policy if exists inscricoes_digitais_coordenacao on public.inscricoes_digitais;
drop policy if exists inscricoes_digitais_professor_leitura on public.inscricoes_digitais;
drop policy if exists inscricoes_digitais_leitura on public.inscricoes_digitais;
drop policy if exists inscricoes_digitais_insercao on public.inscricoes_digitais;
drop policy if exists inscricoes_digitais_atualizacao on public.inscricoes_digitais;
drop policy if exists inscricoes_digitais_exclusao on public.inscricoes_digitais;

create policy inscricoes_digitais_leitura
on public.inscricoes_digitais
for select
to authenticated
using (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'coordenador_pedagogico', 'administrativo', 'professor']
  )
);

create policy inscricoes_digitais_insercao
on public.inscricoes_digitais
for insert
to authenticated
with check (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
  )
);

create policy inscricoes_digitais_atualizacao
on public.inscricoes_digitais
for update
to authenticated
using (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
  )
)
with check (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
  )
);

create policy inscricoes_digitais_exclusao
on public.inscricoes_digitais
for delete
to authenticated
using (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
  )
);

grant select, insert, update, delete on public.inscricoes_digitais to authenticated;

comment on table public.inscricoes_digitais is
  'Fila de revisao de fichas de matricula recebidas por formulario publico ou OCR.';

notify pgrst, 'reload schema';

commit;
