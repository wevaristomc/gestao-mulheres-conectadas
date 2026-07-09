-- Fase 3a — Relatório Parcial de Execução do Objeto (DEQ_FISCAL Item I)
-- Idempotente, aditivo. Aplica no banco REAL (yqvocpnvunaprpmhlswn).
-- NÃO usa Lovable Cloud.
--
-- Escopo desta migração:
--   - Tabela `relatorios_parcial_objeto` para rascunhos editáveis por ciclo/período.
--   - Trigger de updated_at.
--   - RLS + GRANTs seguindo o padrão de `permissoes_papel`/`instrutor_turmas`/
--     `audit_log`: exige vínculo ATIVO (`user_roles.ativo`) no projeto exato.
--     NÃO aceita `ur.projeto_id is null` como "acesso global" — evita
--     escalonamento caso alguém insira uma role sem projeto_id no futuro.
--
-- Padrão de verificação (Cowork/Claude 2026-07): antes de sinalizar "pronto
-- para aplicar", conferido que:
--   * `projetos`, `turmas` (com projeto_id, ciclo), `user_roles` (com role,
--     projeto_id, ativo) já existem no schema real e são referenciadas em código.
--   * a função é SELECT/INSERT/UPDATE/DELETE apenas de rows do próprio projeto,
--     nenhuma referência a coluna d.titulo/d.nome herdada de outras migrações.

create table if not exists public.relatorios_parcial_objeto (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null,
  ciclo integer,
  periodo_inicio date,
  periodo_fim date,
  titulo text,
  secoes jsonb not null default '{}'::jsonb,
  contexto jsonb not null default '{}'::jsonb,
  status text not null default 'rascunho',
  criado_por uuid,
  atualizado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'relatorios_parcial_objeto_status_chk'
  ) then
    alter table public.relatorios_parcial_objeto
      add constraint relatorios_parcial_objeto_status_chk
      check (status in ('rascunho','revisado','exportado'));
  end if;
end $$;

create index if not exists relatorios_parcial_objeto_projeto_idx
  on public.relatorios_parcial_objeto (projeto_id, atualizado_em desc);

create index if not exists relatorios_parcial_objeto_ciclo_idx
  on public.relatorios_parcial_objeto (projeto_id, ciclo);

-- Trigger de atualizado_em ---------------------------------------------------
create or replace function public.set_relatorios_parcial_objeto_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_relatorios_parcial_objeto_atualizado_em
  on public.relatorios_parcial_objeto;

create trigger trg_relatorios_parcial_objeto_atualizado_em
  before update on public.relatorios_parcial_objeto
  for each row execute function public.set_relatorios_parcial_objeto_atualizado_em();

-- Grants --------------------------------------------------------------------
-- Todas as policies filtram por auth.uid() via user_roles, então anon NÃO é
-- concedido; o SECURITY do PostgREST fica com authenticated + service_role.
grant select, insert, update, delete on public.relatorios_parcial_objeto to authenticated;
grant all on public.relatorios_parcial_objeto to service_role;

alter table public.relatorios_parcial_objeto enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='relatorios_parcial_objeto'
      and policyname='relatorios_parcial_objeto_read'
  ) then
    create policy relatorios_parcial_objeto_read on public.relatorios_parcial_objeto
      for select to authenticated
      using (
        exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.ativo
            and ur.projeto_id = relatorios_parcial_objeto.projeto_id
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='relatorios_parcial_objeto'
      and policyname='relatorios_parcial_objeto_write'
  ) then
    create policy relatorios_parcial_objeto_write on public.relatorios_parcial_objeto
      for all to authenticated
      using (
        exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.ativo
            and ur.projeto_id = relatorios_parcial_objeto.projeto_id
        )
      )
      with check (
        exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.ativo
            and ur.projeto_id = relatorios_parcial_objeto.projeto_id
        )
      );
  end if;
end $$;