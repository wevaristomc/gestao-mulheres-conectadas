-- Alinha o schema publicado aos formulários de Materiais, Benefícios e Despesas.
-- Seguro para reexecução: usa ADD COLUMN IF NOT EXISTS e recria apenas as policies deste patch.

begin;

alter table public.entregas_materiais
  add column if not exists projeto_id uuid references public.projetos(id) on delete cascade,
  add column if not exists turma_id uuid references public.turmas(id) on delete set null,
  add column if not exists cursista_id uuid references public.cursistas(id) on delete set null,
  add column if not exists descricao text,
  add column if not exists quantidade numeric default 1,
  add column if not exists valor numeric,
  add column if not exists data_entrega date,
  add column if not exists status text default 'previsto',
  add column if not exists observacoes text;

alter table public.entregas_beneficios
  add column if not exists projeto_id uuid references public.projetos(id) on delete cascade,
  add column if not exists turma_id uuid references public.turmas(id) on delete set null,
  add column if not exists cursista_id uuid references public.cursistas(id) on delete set null,
  add column if not exists valor numeric,
  add column if not exists status text default 'previsto',
  add column if not exists observacoes text;

alter table public.despesas
  add column if not exists descricao text,
  add column if not exists data date,
  add column if not exists status text default 'prevista';

-- Preserva o conteúdo das colunas legadas já existentes em materiais/benefícios.
update public.entregas_materiais
set descricao = coalesce(descricao, item::text)
where descricao is null and item is not null;

update public.entregas_materiais
set data_entrega = coalesce(data_entrega, data::date)
where data_entrega is null and data is not null;

update public.entregas_beneficios
set data_entrega = coalesce(data_entrega, data::date)
where data_entrega is null and data is not null;

-- Recupera turma, cursista e projeto a partir da matrícula quando possível.
update public.entregas_materiais e
set turma_id = coalesce(e.turma_id, m.turma_id),
    cursista_id = coalesce(e.cursista_id, m.cursista_id)
from public.matriculas m
where e.matricula_id = m.id
  and (e.turma_id is null or e.cursista_id is null);

update public.entregas_beneficios e
set turma_id = coalesce(e.turma_id, m.turma_id),
    cursista_id = coalesce(e.cursista_id, m.cursista_id)
from public.matriculas m
where e.matricula_id = m.id
  and (e.turma_id is null or e.cursista_id is null);

update public.entregas_materiais e
set projeto_id = t.projeto_id
from public.turmas t
where e.projeto_id is null and e.turma_id = t.id;

update public.entregas_beneficios e
set projeto_id = t.projeto_id
from public.turmas t
where e.projeto_id is null and e.turma_id = t.id;

create index if not exists entregas_materiais_projeto_idx
  on public.entregas_materiais(projeto_id);
create index if not exists entregas_beneficios_projeto_idx
  on public.entregas_beneficios(projeto_id);
create index if not exists despesas_projeto_idx
  on public.despesas(projeto_id);

alter table public.entregas_materiais enable row level security;
alter table public.entregas_beneficios enable row level security;
alter table public.despesas enable row level security;

drop policy if exists entregas_materiais_operacao on public.entregas_materiais;
create policy entregas_materiais_operacao
on public.entregas_materiais
for all
to authenticated
using (
  public.has_role_any(auth.uid(), array['coordenador_geral', 'administrativo'])
)
with check (
  public.has_role_any(auth.uid(), array['coordenador_geral', 'administrativo'])
);

drop policy if exists entregas_beneficios_operacao on public.entregas_beneficios;
create policy entregas_beneficios_operacao
on public.entregas_beneficios
for all
to authenticated
using (
  public.has_role_any(auth.uid(), array['coordenador_geral', 'administrativo'])
)
with check (
  public.has_role_any(auth.uid(), array['coordenador_geral', 'administrativo'])
);

drop policy if exists despesas_operacao on public.despesas;
create policy despesas_operacao
on public.despesas
for all
to authenticated
using (
  public.has_role_any(
    auth.uid(),
    array['coordenador_geral', 'administrativo', 'gestor_financeiro']
  )
)
with check (
  public.has_role_any(
    auth.uid(),
    array['coordenador_geral', 'administrativo', 'gestor_financeiro']
  )
);

grant select, insert, update, delete on public.entregas_materiais to authenticated;
grant select, insert, update, delete on public.entregas_beneficios to authenticated;
grant select, insert, update, delete on public.despesas to authenticated;

notify pgrst, 'reload schema';

commit;
