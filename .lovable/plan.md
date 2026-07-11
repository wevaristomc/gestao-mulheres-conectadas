# Correção de vazamento de permissões — plano de execução

O escopo é grande (20+ arquivos `.functions.ts`, sidebar, ~30 rotas, dashboard reduzido, docs). Antes de tocar em todos os arquivos, quero confirmar prioridades e a estratégia de cada camada — pequenas escolhas de arquitetura mudam MUITO o volume de código.

## Estratégia por camada

### Camada 1 — Sidebar + guardas de rota (baixo risco)
- Reescrever `src/lib/role-access.ts` (`MODULE_ACCESS`) com a matriz nova:
  - **professor / auxiliar_pedagogico**: `pedagogico`, `relacao-horas`, `base-conhecimento`, `ajuda`, `etapas` (leitura), `pendencias`. **Fora**: `visao-geral` geral, `mte`, `financeiro`, `relatorios`, `captacao`, `whatsapp`, `configuracoes`, `administrativo`, `drive`.
  - **gestor_financeiro**: `financeiro`, `financeiro-relacoes-horas`, `relatorios` (leitura), `ajuda`, `pendencias`, `base-conhecimento`. Fora: pedagógico/MTE/configurações.
  - **coordenador_pedagogico**: pedagógico, MTE, relatórios, etapas, ajuda, base, drive, pendências, visão-geral. Fora: financeiro, configurações.
  - **coordenador_geral / administrativo**: tudo (inalterado).
- Substituir o comentário "fail-open" em `requireModuleAccess`: quando role já está em cache, bloquear com `redirect({ to: "/" })` + toast (via search param) para telas fora do escopo do papel.
- Sidebar (`app-sidebar.tsx`): já filtra por `canAccess`; só validar que os itens novos aparecem certos após a matriz.
- Criar rota `index.tsx` que, para professor, redireciona a `/pedagogico` (dashboard geral fica bloqueado). Ou renderizar um "Minhas turmas" reduzido no `visao-geral` para professor (ver pergunta 1 abaixo).

### Camada 2 — Server functions (crítico)
Criar `src/lib/rbac-guard.ts` com:
```ts
export async function papelDoUsuario(supabase, userId): Promise<AppRole | null>
export async function exigirPapel(supabase, userId, papeis: AppRole[]): void
export async function turmasDoUsuario(supabase, userId): Promise<string[]>  // via instrutor_turmas
export async function exigirTurmaDoUsuario(supabase, userId, turmaId): void
```
- Todas leem via `context.supabase` (RLS do usuário) para a checagem de papel — **não** via admin.

Aplicar em cada `.functions.ts`. Padrão por módulo:

| Arquivo | Regra |
|---|---|
| `ava-turmas`, `ava-matriculas`, `ava-beneficiarias`, `mte-relatorios`, `moodle-import`, `moodle-sync`, `consolidado-qajbc`, `oficio-49148`, `ciclo2-previsto`, `relatorio-parcial-objeto`, `certificados`, `leitor-drive` | Exigir coordenação (`coordenador_geral`, `coordenador_pedagogico`, `administrativo`). Professor negado. |
| `mte-relatorios` (listas frequência/entrega por turma) | Se professor: `exigirTurmaDoUsuario` no `turmaId` da entrada; senão exige coordenação. |
| `relatorios` (análise IA) | Exigir coordenação + financeiro (leitura). Professor negado. |
| `drive-sync`, `gdrive`, `base-conhecimento`, `ia` (configurações), `editais-busca` | Exigir coordenação. |
| `whatsapp` | Exigir coordenação. |
| `orbe` (ferramentas) | Injetar papel + turmas no contexto de execução; ferramentas `listar_turmas`/`detalhar`/`matriculas`/`frequencia`/`buscar_beneficiaria` filtram por `turmasDoUsuario` quando professor; `financeiro_resumo`, `orcamento`, `pendencias_financeiras` → só financeiro/coordenação; `etapas`/`pendencias` leitura livre. |
| `users`, `rbac` | Já exige `coordenador_geral` no `rbac.functions.ts`; auditar `users.functions.ts` do mesmo jeito. |

**Ponto de risco**: várias dessas fns hoje fazem `getSupabaseAdmin()` sem checar papel — é aí que o vazamento acontece. Vou manter o admin para o WRITE quando faz sentido, mas SEMPRE precedido por `exigirPapel` via `context.supabase`.

### Camada 3 — UI / client queries
- `pedagogico.index.tsx` (lista de turmas): para professor, filtrar por `turmas.id IN (select turma_id from instrutor_turmas where user_id = auth.uid())`. Já era esperado que RLS fizesse isso, mas garantir na query.
- `mte.beneficiarias.tsx`, `mte.turmas.tsx`, `mte.matriculas.tsx`, `mte.evidencias.tsx`, `mte.presencas.tsx`, `mte.aulas.tsx`, `mte.importar-lista.tsx`, `mte.cronograma.tsx`, `mte.checklist.tsx`, `mte.ava.tsx`, `mte.index.tsx` — todas ficam bloqueadas para professor pela guarda de rota; sem edições internas.
- Dashboard (`index.tsx` de `_authenticated`): se professor → renderizar "Minhas turmas" (cards das turmas vinculadas) em vez do painel geral, OU redirect para `/pedagogico`. **Pergunta 1 abaixo.**

### Camada 4 — Documentação
- `docs/PERMISSOES.md` com a matriz final papel × módulo × ação e a lista de cada server function auditada e a checagem aplicada. Sem SQL — texto para coordenação.

### Verificação
- `bun run typecheck` limpo.
- Testar como `coordenador_geral`: nenhum acesso perdido.

## Perguntas antes de começar

1. **Dashboard do professor**: prefere (a) redirect para `/pedagogico` (mais simples, sem UI nova) ou (b) um "Minhas turmas" reduzido em `/` (mais trabalho, mas melhor UX)?
2. **Etapas para professor**: leitura sem edição — confirmar. Basta esconder botões de edição, ou também restringir server fns de escrita a coordenação?
3. **Toast de "sem permissão"**: hoje não temos infraestrutura para toast em `beforeLoad` (só `redirect`). Está ok redirect silencioso para `/pedagogico` (professor) ou `/` (coordenação), OU quer que eu adicione um `?erro=sem-permissao` que a rota destino lê e mostra toast?
4. **Financeiro vs Relatórios para gestor_financeiro**: quer que ele veja TODOS os relatórios (frequência, pedagógico, MTE, orçamentário) ou só orçamentário/financeiro?

Com as 4 respostas fecho o escopo e executo camada a camada. Estimativa: ~25 arquivos editados, 2 criados (`rbac-guard.ts`, `PERMISSOES.md`).