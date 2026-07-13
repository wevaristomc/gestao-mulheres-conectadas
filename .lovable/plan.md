## Objetivo

Quando o papel efetivo do usuário for **Professor(a)** ou **Auxiliar Pedagógico**, todas as listas e telas do sistema devem mostrar apenas dados das turmas vinculadas a ele em `instrutor_turmas`. Hoje o filtro só existe em uma parte do módulo Pedagógico (com toggle "só minhas turmas") e não existe no módulo MTE — por isso o professor vê turmas/aulas/matrículas/presenças/evidências de outros.

## Escopo das mudanças (só camada de leitura/UI)

Apenas queries de listagem e guardas de rota. Nenhuma mudança em RLS, migrations ou lógica de negócio.

### 1. Detecção de "usuário restrito"

Criar um helper `useEscopoTurmas()` (em `src/hooks/`) que retorna:
- `restrictToUserId: string | null` — `user.id` quando o papel efetivo for `professor` ou `auxiliar_pedagogico`; `null` para coordenação/administrativo/financeiro (sem restrição).
- `turmasPermitidas: string[] | null` — carregado uma vez de `instrutor_turmas` para o usuário atual, cacheado; `null` quando não há restrição.

Fonte do papel: `useActiveContext()` (já existe).

### 2. Pedagógico

- `src/lib/pedagogico-queries.ts` — já aceita `restrictToUserId` em `turmasListOptions`. Adicionar o mesmo parâmetro/filtro em: `aulasByTurmaOptions`, `cursistasByTurmaOptions`, `frequenciasByTurmaOptions` (filtro por `turma_id IN turmasPermitidas`).
- `src/routes/_authenticated/pedagogico.index.tsx` — quando `restrictToUserId` vier do hook, forçar filtro (o toggle "Só minhas turmas" desaparece / vira read-only marcado).
- `src/routes/_authenticated/pedagogico.turmas.$id.tsx` (layout) — no `beforeLoad`/component, se `restrictToUserId` e a turma não estiver em `turmasPermitidas`, redirecionar para `/pedagogico` com toast "Turma fora do seu escopo".

### 3. MTE

Adicionar suporte a escopo por turma em `src/lib/mte-queries.ts`:
- `turmasMteListOptions(restrictToUserId?)` — filtra pelas turmas em `instrutor_turmas`.
- `aulasMteListOptions(turmaId, restrictToUserId?)` — quando não há `turmaId`, restringe pelas turmas permitidas; quando há, valida se está permitida (senão retorna vazio).
- `matriculasListOptions(turmaId, restrictToUserId?)` — mesmo tratamento.
- `evidenciasByTurmaOptions(turmaId, restrictToUserId?)` — mesmo tratamento.
- `cronogramaGeralOptions(restrictToUserId?)` — filtra por turmas permitidas.
- `presencasByAulaOptions(aulaId, restrictToUserId?)` — valida se a aula pertence a uma turma permitida.

Rotas afetadas (adicionar `useEscopoTurmas()` e passar `restrictToUserId`):
- `mte.turmas.tsx`
- `mte.aulas.tsx`
- `mte.matriculas.tsx`
- `mte.presencas.tsx`
- `mte.evidencias.tsx`
- `mte.cronograma.tsx`
- `mte.importar-lista.tsx` (o seletor de turma só mostra as permitidas)

Em cada uma, os `<Select>` de turma passam a listar apenas turmas permitidas. Nenhuma referência a outras turmas fica visível.

### 4. Relatórios / Relação de Horas

- `relacao-horas.tsx` já é escopado pelo próprio `professorUserId` — sem mudanças.
- Rotas em `relatorios.*` (frequência, pedagógico, indicadores, metas, MTE, orçamentário, parcial-objeto): quando `restrictToUserId` estiver ativo, filtrar as opções de turma/curso da UI para as permitidas (as agregações continuam usando os mesmos endpoints, mas a seleção do usuário fica limitada).

### 5. Sem alteração de escrita

Os botões "Salvar chamada", "Salvar aula", "Editar turma" continuam funcionando quando a turma pertence ao professor. Não vamos mudar server functions nem RLS neste passo — a proteção de escrita permanece via `PAPEIS_INSTRUTORES` + `exigirTurmaDoUsuario` já existente em `rbac-guard.ts`.

## Validação

1. Logar como Coordenador Geral → vê todas as turmas em Pedagógico e MTE (sem regressão).
2. Logar como Professor vinculado a `JBT-MC-01` → nas abas MTE (Turmas, Aulas, Matrículas, Presenças, Evidências, Cronograma) e Pedagógico (index e sub-rotas), só aparece `JBT-MC-01`.
3. Acessar diretamente `/pedagogico/turmas/<id-de-outra-turma>` com esse professor → redireciona para `/pedagogico` com aviso.
4. Typecheck limpo.

## Arquivos que serão editados/criados

- criar `src/hooks/use-escopo-turmas.tsx`
- editar `src/lib/pedagogico-queries.ts`
- editar `src/lib/mte-queries.ts`
- editar rotas MTE listadas acima
- editar `src/routes/_authenticated/pedagogico.index.tsx`
- editar `src/routes/_authenticated/pedagogico.turmas.$id.tsx`
- ajustes menores em rotas de `relatorios.*` que expõem seletor de turma
