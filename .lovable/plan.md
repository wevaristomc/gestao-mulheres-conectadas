## Painel Mulheres Conectadas — Shell inicial (revisado)

Você roda o DDL de `user_roles` + `get_user_role()` direto no Supabase Editor. Eu **não** crio migrations nem toco no schema: apenas leio das tabelas existentes. O Lovable Cloud fica desativado; uso a integração Supabase externa que você vai conectar.

### Pré-requisitos seus (antes de eu construir)

1. Conectar a integração Supabase externa neste projeto Lovable (botão verde no topo).
2. Rodar seu DDL de `user_roles`, índices, `get_user_role()` e RLS no SQL Editor.
3. Inserir ao menos uma linha em `user_roles` ligando seu `auth.users.id` a um `projetos.id` com role `coordenador_geral`, para você conseguir entrar e ver tudo.

> **Aviso de segurança que vou repassar uma única vez (decisão sua):** a política `user_roles_self_read` referencia `user_roles` dentro do próprio `USING`, o que tende a causar **recursão infinita** no Postgres RLS. O padrão seguro é uma função `SECURITY DEFINER` (ex.: `is_coordenador_geral(uuid)`) e usar essa função na policy. Se aparecer erro `infinite recursion detected in policy`, é isso. Eu sigo o plano assumindo que sua DDL está como você quer; só ajusto se você pedir.

### 1. Conceito de "projeto ativo"

Como roles são por `(user_id, projeto_id)`, o shell precisa de um **projeto ativo**:

- Server fn `listMyProjects()` (autenticada): retorna todos os `projetos` em que o usuário tem alguma linha em `user_roles`.
- Seletor de projeto no topbar (Combobox shadcn) — se houver só um, fica fixo mostrando o nome. Projeto ativo guardado em `localStorage` (`active_projeto_id`) + context React.
- Ao trocar de projeto: recarrega `roles` e invalida queries.

### 2. Autenticação e papel

- `/auth`: login e-mail/senha + "Esqueci minha senha" + `/reset-password`. Sem auto-cadastro.
- Layout `_authenticated/route.tsx` (gerenciado pela integração) redireciona para `/auth`.
- Server fn `getMyRole({ projetoId })` chama `get_user_role(auth.uid(), projetoId)` e retorna o texto do role; o cliente também pode ler `user_roles` direto via RLS, mas a server fn é a fonte oficial.
- Hook `useActiveRole()` expõe `{ projetoId, projetoNome, role, hasRole(...), hasAnyRole([...]) }`. Pego no carregamento e ao trocar de projeto, via TanStack Query (não `sessionStorage` cru — Query já dá cache + invalidação).

### 3. Shell visual

- **Sidebar fixa** (shadcn `Sidebar`, colapsável em modo ícone), itens filtrados por `role`:
  Visão Geral · Pendências · Pedagógico · Administrativo · Financeiro · Captação · Base de Conhecimento · Configurações.
- **Topbar**: à esquerda "Painel Mulheres Conectadas" + seletor de projeto ativo. À direita: sino com badge contando `pendencias` abertas **do projeto ativo** (server fn `countPendenciasAbertas({ projetoId })`, `staleTime` 30s), avatar com dropdown (sair).
- **Design**: paleta neutra com azul institucional `#1E40AF` como `--primary`; tipografia Inter (corpo) + Outfit (títulos) via `@fontsource`; alta densidade, tabelas shadcn com busca/filtro padronizadas para uso futuro; cards KPI consistentes.
- Responsivo, otimizado para desktop (sidebar colapsa <1024px).

### 4. Rotas (todas sob `_authenticated/`)

- `/` Visão Geral — 4 cards KPI placeholder mostrando "—" enquanto não há dados: "Cursistas ativas", "Turmas em andamento", "Execução orçamentária", "Pendências abertas" (esta já com valor real, vinda da mesma query do sino).
- `/pendencias`, `/pedagogico`, `/administrativo`, `/financeiro`, `/captacao`, `/base-conhecimento`, `/configuracoes` — páginas vazias com cabeçalho rotulado e estado "Em construção".

### 5. Matriz de visibilidade na sidebar

| Módulo | Papéis com acesso |
|---|---|
| Visão Geral, Pendências, Base de Conhecimento | todos |
| Pedagógico | coordenador_geral, coordenador_pedagogico, professor, auxiliar_pedagogico |
| Administrativo | coordenador_geral, administrativo |
| Financeiro | coordenador_geral, gestor_financeiro |
| Captação | coordenador_geral, gestor_financeiro |
| Configurações | coordenador_geral |

Diga se quer ajustar; senão sigo com essa.

### 6. Detalhes técnicos

- TanStack Start, rotas em `src/routes/`, file-based.
- Server fns em `src/lib/*.functions.ts` com `requireSupabaseAuth`; loaders chamam `context.queryClient.ensureQueryData(...)`, componentes usam `useSuspenseQuery`.
- Sem dados mock — onde não houver query real, mostra "—".
- TypeScript strict; nenhuma alteração nas tabelas existentes (`projetos`, `pendencias`, etc.), apenas leitura.

### Confirmações que preciso antes de implementar

1. Conectou a integração Supabase e rodou o DDL? (responda "ok")
2. Matriz de papéis acima está boa?
3. OK em ter seletor de projeto ativo no topbar (necessário porque roles são por projeto)?