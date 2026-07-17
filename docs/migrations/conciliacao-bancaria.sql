-- Conciliação bancária por projeto.
-- Execute no SQL Editor do Supabase antes de liberar a tela Financeiro > Conciliação bancária.

create table if not exists public.extratos_bancarios (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  nome_arquivo text not null,
  mes_referencia date,
  status text not null default 'processado' check (status in ('processando', 'processado', 'erro')),
  total_lancamentos integer not null default 0,
  total_creditos numeric(14,2) not null default 0,
  total_debitos numeric(14,2) not null default 0,
  importado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.extrato_lancamentos (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_bancarios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  numero_linha integer not null,
  data_lancamento date not null,
  valor numeric(14,2) not null check (valor > 0),
  tipo text not null check (tipo in ('credito', 'debito')),
  contraparte text,
  descricao text,
  documento text,
  dados_originais jsonb not null default '{}'::jsonb,
  conciliado boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (extrato_id, numero_linha)
);

create table if not exists public.conciliacoes_bancarias (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  lancamento_id uuid not null references public.extrato_lancamentos(id) on delete cascade,
  beneficio_id uuid not null references public.entregas_beneficios(id) on delete cascade,
  score integer not null default 0 check (score between 0 and 100),
  status text not null default 'confirmado' check (status in ('sugerido', 'confirmado', 'rejeitado')),
  confirmado_por uuid references auth.users(id) on delete set null,
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (lancamento_id),
  unique (beneficio_id)
);

create index if not exists extratos_bancarios_projeto_idx
  on public.extratos_bancarios (projeto_id, criado_em desc);
create index if not exists extrato_lancamentos_extrato_idx
  on public.extrato_lancamentos (extrato_id, data_lancamento);
create index if not exists extrato_lancamentos_projeto_idx
  on public.extrato_lancamentos (projeto_id, conciliado, data_lancamento desc);
create index if not exists conciliacoes_bancarias_projeto_idx
  on public.conciliacoes_bancarias (projeto_id, confirmado_em desc);

grant select, insert, update, delete on public.extratos_bancarios to authenticated;
grant select, insert, update, delete on public.extrato_lancamentos to authenticated;
grant select, insert, update, delete on public.conciliacoes_bancarias to authenticated;

alter table public.extratos_bancarios enable row level security;
alter table public.extrato_lancamentos enable row level security;
alter table public.conciliacoes_bancarias enable row level security;

drop policy if exists extratos_bancarios_projeto on public.extratos_bancarios;
create policy extratos_bancarios_projeto on public.extratos_bancarios
  for all to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.projeto_id = extratos_bancarios.projeto_id
        and coalesce(ur.ativo, true)
        and ur.role::text in ('coordenador_geral', 'administrativo', 'gestor_financeiro')
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.projeto_id = extratos_bancarios.projeto_id
        and coalesce(ur.ativo, true)
        and ur.role::text in ('coordenador_geral', 'administrativo', 'gestor_financeiro')
    )
  );

drop policy if exists extrato_lancamentos_projeto on public.extrato_lancamentos;
create policy extrato_lancamentos_projeto on public.extrato_lancamentos
  for all to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.projeto_id = extrato_lancamentos.projeto_id
        and coalesce(ur.ativo, true)
        and ur.role::text in ('coordenador_geral', 'administrativo', 'gestor_financeiro')
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.projeto_id = extrato_lancamentos.projeto_id
        and coalesce(ur.ativo, true)
        and ur.role::text in ('coordenador_geral', 'administrativo', 'gestor_financeiro')
    )
  );

drop policy if exists conciliacoes_bancarias_projeto on public.conciliacoes_bancarias;
create policy conciliacoes_bancarias_projeto on public.conciliacoes_bancarias
  for all to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.projeto_id = conciliacoes_bancarias.projeto_id
        and coalesce(ur.ativo, true)
        and ur.role::text in ('coordenador_geral', 'administrativo', 'gestor_financeiro')
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.projeto_id = conciliacoes_bancarias.projeto_id
        and coalesce(ur.ativo, true)
        and ur.role::text in ('coordenador_geral', 'administrativo', 'gestor_financeiro')
    )
  );
