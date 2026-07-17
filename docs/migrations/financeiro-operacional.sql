-- Alinha fornecedores e itens de orçamento aos formulários do módulo Financeiro.
-- Idempotente e retrocompatível com o schema legado em produção.

begin;

alter table public.fornecedores
  add column if not exists projeto_id uuid references public.projetos(id) on delete cascade,
  add column if not exists cnpj text,
  add column if not exists email text,
  add column if not exists telefone text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.fornecedores
set cnpj = coalesce(cnpj, cnpj_cpf)
where cnpj is null and cnpj_cpf is not null;

alter table public.orcamento_itens
  add column if not exists descricao text,
  add column if not exists categoria text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.orcamento_itens
set categoria = coalesce(categoria, rubrica),
    descricao = coalesce(descricao, rubrica)
where categoria is null or descricao is null;

create index if not exists fornecedores_projeto_idx
  on public.fornecedores (projeto_id);
create index if not exists orcamento_itens_projeto_idx
  on public.orcamento_itens (projeto_id);

create or replace function public.set_financeiro_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fornecedores_updated_at on public.fornecedores;
create trigger trg_fornecedores_updated_at
before update on public.fornecedores
for each row execute function public.set_financeiro_updated_at();

drop trigger if exists trg_orcamento_itens_updated_at on public.orcamento_itens;
create trigger trg_orcamento_itens_updated_at
before update on public.orcamento_itens
for each row execute function public.set_financeiro_updated_at();

alter table public.fornecedores enable row level security;
alter table public.orcamento_itens enable row level security;

drop policy if exists financeiro_fornecedores_operacao on public.fornecedores;
create policy financeiro_fornecedores_operacao
on public.fornecedores
for all
to authenticated
using (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'administrativo', 'gestor_financeiro']
  )
)
with check (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'administrativo', 'gestor_financeiro']
  )
);

drop policy if exists financeiro_orcamento_operacao on public.orcamento_itens;
create policy financeiro_orcamento_operacao
on public.orcamento_itens
for all
to authenticated
using (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'administrativo', 'gestor_financeiro']
  )
)
with check (
  public.has_role_any(
    (select auth.uid()),
    array['coordenador_geral', 'administrativo', 'gestor_financeiro']
  )
);

grant select, insert, update, delete on public.fornecedores to authenticated;
grant select, insert, update, delete on public.orcamento_itens to authenticated;

notify pgrst, 'reload schema';

commit;
