## Diagnóstico

Confirmado no banco real: as tabelas `orcamento_itens`, `despesas`, `fornecedores` (e `rubricas`) **não existem** no schema `public`. Por isso qualquer "Salvar" nas abas Orçamento, Despesas, Fornecedores e Rubricas retorna erro do PostgREST — o app até mostra o toast de erro, mas nada persiste porque a tabela não está lá.

O código do frontend (`src/lib/financeiro-queries.ts`) já espera os nomes de coluna corretos (`projeto_id`, `descricao`, `categoria`, `valor_previsto`, `valor_executado`, `nome`, `cnpj`, `email`, `telefone`, `data`, `valor`, `status`, `fornecedor_id`, `orcamento_item_id`). Falta apenas a migração criando as tabelas com GRANTs + RLS.

## Plano — criar as tabelas do módulo Financeiro

Uma única migração `docs/migrations/financeiro-core.sql` com, para cada tabela: `CREATE TABLE` → `GRANT` (`authenticated` CRUD + `service_role` ALL, sem `anon`) → `ENABLE RLS` → políticas → trigger `updated_at`.

### Tabelas

1. **`fornecedores`** — `id`, `projeto_id → projetos(id) ON DELETE CASCADE`, `nome NOT NULL`, `cnpj`, `email`, `telefone`, `created_at`, `updated_at`. Índice em `projeto_id`.
2. **`orcamento_itens`** — `id`, `projeto_id → projetos(id) ON DELETE CASCADE`, `categoria`, `descricao`, `valor_previsto numeric NOT NULL DEFAULT 0`, `valor_executado numeric NOT NULL DEFAULT 0`, timestamps. Índice em `projeto_id`.
3. **`despesas`** — `id`, `projeto_id → projetos(id) ON DELETE CASCADE`, `descricao`, `valor numeric NOT NULL DEFAULT 0`, `data date`, `fornecedor_id → fornecedores(id) ON DELETE SET NULL`, `orcamento_item_id → orcamento_itens(id) ON DELETE SET NULL`, `status text`, timestamps. Índices em `projeto_id`, `fornecedor_id`, `orcamento_item_id`.
4. **`rubricas`** — `id`, `projeto_id → projetos(id) ON DELETE CASCADE`, `codigo`, `nome`, `categoria`, `valor_previsto numeric DEFAULT 0`, timestamps (para desbloquear a aba Rubricas, que hoje quebra pelo mesmo motivo).

### RLS — mesmo modelo já usado no projeto

- `SELECT` para `authenticated` quando o usuário tem vínculo com o `projeto_id` via `user_roles` (papel de coordenação/administrativo/financeiro/pedagógico) **ou** é professor/auxiliar vinculado em `instrutor_turmas` de alguma turma do projeto (leitura).
- `INSERT/UPDATE/DELETE` restrito aos papéis financeiros: `coordenador_geral`, `administrativo`, `gestor_financeiro`, `coordenador_pedagogico` — usando `public.is_project_admin(auth.uid(), projeto_id)` que já existe.
- `service_role` sempre `ALL`.

### Trigger

Reutilizar `public.update_updated_at_column()` (já existe) em `BEFORE UPDATE` de cada tabela.

### Depois da migração

Nenhuma mudança no frontend é necessária — o código atual já monta os payloads compatíveis. A migração precisa ser aprovada e aplicada; após isso, criar/editar itens em Orçamento, Despesas, Fornecedores e Rubricas volta a funcionar imediatamente.

Nada de mexer em `auth`, `storage` ou outras tabelas existentes.