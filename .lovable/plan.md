## Módulo Pedagógico — Fase 1

Objetivo: transformar `/pedagogico` (hoje placeholder) em um módulo funcional com listagem de turmas, detalhe da turma com suas aulas, e grade de frequência dos cursistas — mais CRUD básico para lançar aulas e marcar presença. Todo o schema é descoberto em runtime; queries são defensivas (colunas faltantes → "—", RLS negando → "sem acesso").

### Rotas novas (`src/routes/_authenticated/`)

```text
pedagogico.tsx                    → lista de turmas do projeto ativo
pedagogico.turmas.$id.tsx         → layout com abas (Aulas | Frequência | Cursistas)
pedagogico.turmas.$id.index.tsx   → redirect p/ aba Aulas
pedagogico.turmas.$id.aulas.tsx
pedagogico.turmas.$id.frequencia.tsx
pedagogico.turmas.$id.cursistas.tsx
```

Todas com `beforeLoad: () => requireModuleAccess("pedagogico")`.

### Queries (`src/lib/pedagogico-queries.ts` — novo arquivo)

- `turmasListOptions(projetoId)` → `turmas.select('*').eq('projeto_id', ...)`; renderiza qualquer coluna reconhecida (nome, turno, carga_horaria, data_inicio, data_fim, professor_id, local).
- `turmaByIdOptions(turmaId)` → detalhe da turma.
- `aulasByTurmaOptions(turmaId)` → `aulas.select('*').eq('turma_id', ...).order('data')`.
- `cursistasByTurmaOptions(turmaId)` → `matriculas.select('id, cursista_id, cursistas(*)').eq('turma_id', ...)`.
- `frequenciaGridOptions(turmaId)` → tenta `frequencias` primeiro; se PostgREST devolver 42P01 (tabela inexistente), tenta `presencas`; guarda a tabela detectada em memória para reuso. Se ambas falharem, retorna `{ tableName: null, rows: [] }` e a UI mostra estado vazio explicando.
- Mutations: `upsertAula`, `deleteAula`, `upsertFrequencia` (recebe `{ aula_id, matricula_id, presente }`).

Todas as queries retornam `{ data, error }` no mesmo padrão de `dashboard-queries.ts`.

### Telas

**`/pedagogico`** — tabela de turmas do `projetoId` ativo. Colunas montadas dinamicamente a partir da primeira row (whitelist: nome, turno, data_inicio, data_fim, carga_horaria). Cada linha é `<Link to="/pedagogico/turmas/$id">`. Skeleton enquanto carrega, "Sem turmas neste projeto" quando vazio.

**`/pedagogico/turmas/$id`** — header com nome/turno/período da turma + `<Tabs>` shadcn navegando entre aulas/frequência/cursistas via `<Link>` (não `useState`) para manter URL como fonte de verdade. `<Outlet />` renderiza a aba.

**Aba Aulas** — tabela ordenada por data (data, tema/título, duração, ações). Botão "Nova aula" abre `<Dialog>` com form (data obrigatória; demais campos aparecem se existirem na primeira row detectada). Editar/excluir por linha. Mutations invalidam `["aulas", turmaId]` e `["frequencia", turmaId]`.

**Aba Frequência** — grade cursistas (linhas) × aulas (colunas). Cada célula é um `<Checkbox>` que dispara `upsertFrequencia` otimista. Cabeçalho fixo com data da aula. Se `frequenciaGridOptions` retorna `tableName: null`, mostra painel vazio: "Tabela de frequência não encontrada no banco. Configure `frequencias(aula_id, matricula_id, presente)` para habilitar esta grade."

**Aba Cursistas** — tabela simples com nome/email do cursista + status da matrícula.

### Sidebar / navegação

`app-sidebar.tsx` já tem entrada Pedagógico apontando pra `/pedagogico` — nenhuma mudança. A navegação entre abas usa `<Link>` do TanStack.

### Fora do escopo desta fase

- Criar/editar turmas (só listar — turmas continuam sendo gerenciadas fora da UI por enquanto).
- Criar/editar cursistas e matrículas.
- Relatórios / exportação de frequência.
- Notificações de aulas sem frequência lançada.

### Detalhes técnicos

- Segue padrão existente: `queryOptions` + `useSuspenseQuery` em componentes; `useMutation` + `queryClient.invalidateQueries` para escrita.
- Nenhum server function novo — tudo via `supabase` client no browser sob RLS (mesmo padrão de `dashboard-queries.ts` e da tela de Usuários).
- Se RLS bloquear escrita de aula/frequência para o papel atual, a mutation devolve erro e um `toast` (`sonner`) mostra a mensagem — sem tratamento especial por papel no cliente (RLS é a fonte da verdade).
- Rotas seguem `tanstack-route-architecture`: layout `pedagogico.turmas.$id.tsx` retorna `<Outlet />` e uma `index.tsx` irmã faz `throw redirect({ to: "/pedagogico/turmas/$id/aulas", params })`.
