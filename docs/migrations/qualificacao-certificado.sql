-- Qualificacao manual de matriculas para emissao de certificado.
-- Idempotente: pode ser executada novamente sem recriar colunas, indice,
-- constraint ou policies.

begin;

alter table public.qualificados
  add column if not exists qualificado_por uuid,
  add column if not exists qualificado_em timestamptz not null default now(),
  add column if not exists origem text not null default 'manual',
  add column if not exists observacao text;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.qualificados'::regclass
      and conname = 'qualificados_origem_check'
  ) then
    alter table public.qualificados
      add constraint qualificados_origem_check
      check (origem in ('manual', 'lote', 'criterio'));
  end if;
end
$migration$;

create unique index if not exists qualificados_matricula_uniq
  on public.qualificados (matricula_id);

alter table public.qualificados enable row level security;

-- Remove a policy legada permissiva, criada no bootstrap inicial do projeto.
-- Sem isto, policies permissivas sao combinadas com OR e anulam as regras abaixo.
drop policy if exists "auth users manage qualificados" on public.qualificados;

do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'qualificados'
      and policyname = 'qualificados_leitura_certificado'
  ) then
    create policy qualificados_leitura_certificado
      on public.qualificados
      for select
      to authenticated
      using (
        public.has_role_any(
          (select auth.uid()),
          array[
            'coordenador_geral',
            'coordenador_pedagogico',
            'administrativo',
            'professor'
          ]
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'qualificados'
      and policyname = 'qualificados_inserir_certificado'
  ) then
    create policy qualificados_inserir_certificado
      on public.qualificados
      for insert
      to authenticated
      with check (
        public.has_role_any(
          (select auth.uid()),
          array['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
        )
        and qualificado_por = (select auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'qualificados'
      and policyname = 'qualificados_atualizar_certificado'
  ) then
    create policy qualificados_atualizar_certificado
      on public.qualificados
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
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'qualificados'
      and policyname = 'qualificados_remover_certificado'
  ) then
    create policy qualificados_remover_certificado
      on public.qualificados
      for delete
      to authenticated
      using (
        public.has_role_any(
          (select auth.uid()),
          array['coordenador_geral', 'coordenador_pedagogico', 'administrativo']
        )
        and coalesce(certificado_emitido, false) = false
      );
  end if;
end
$policies$;

notify pgrst, 'reload schema';

commit;
