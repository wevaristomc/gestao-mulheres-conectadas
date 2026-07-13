# Corrigir vazamento de acesso por papel

## Diagnóstico

Dois problemas somados explicam o vazamento reportado:

1. **Matriz `MODULE_ACCESS` frouxa** em `src/lib/role-access.ts`:
   - `base-conhecimento` ainda inclui `professor` e `auxiliar_pedagogico` (e financeiro).
   - `etapas` está como `ALL` (todos os papéis).
   - `visao-geral` e `pendencias` incluem `gestor_financeiro`.
   - `captacao` inclui `gestor_financeiro`.
   - `administrativo` não inclui `gestor_financeiro` (o usuário pediu incluir).
2. **Guarda fail-open em hard refresh** em `src/lib/auth-guard.ts`: `requireModuleAccess` faz `if (role === null) return;`. Como o papel só é hidratado depois do primeiro render pelo `ActiveContextProvider`, um professor que digita `/whatsapp`, `/administrativo`, `/pendencias`, etc. passa a guarda (role ainda null) e a página carrega — o sidebar até esconde o item, mas a URL direta entra.

Também: sidebar mostra o skeleton enquanto carrega, então visualmente já filtra; a rota é a que vaza.

## Alterações

### 1. Nova matriz em `src/lib/role-access.ts`

Ajustar `MODULE_ACCESS` para o pedido exato:

- `visao-geral`, `pendencias`, `etapas`: `coordenador_geral`, `administrativo`, `coordenador_pedagogico` (remover `gestor_financeiro`; remover professor/auxiliar de `etapas`).
- `base-conhecimento`: `coordenador_geral`, `administrativo`, `coordenador_pedagogico` (remover professor, auxiliar, financeiro).
- `whatsapp`: manter `coordenador_geral`, `administrativo`, `coordenador_pedagogico`.
- `captacao`: `coordenador_geral`, `administrativo`, `coordenador_pedagogico` (remover financeiro; conforme "e outros que forem selecionados", deixamos coordenação).
- `administrativo`: adicionar `gestor_financeiro` ao conjunto existente (`coordenador_geral`, `administrativo`).
- `mte` e `pedagogico`: continuam liberados para professor/auxiliar; o escopo por turma já é feito nas telas (`soMinhasTurmas` em pedagogico) — replicar o mesmo filtro em MTE (ver item 3).
- Demais módulos permanecem.

### 2. Fechar o fail-open da guarda em `src/lib/auth-guard.ts`

`requireModuleAccess` deixa de fazer bypass quando `role === null`. Passa a:

- Se não há sessão → `/auth` (comportamento atual via `requireSession`).
- Se há sessão mas o papel ainda não hidratou → em vez de deixar entrar, deixamos o componente da rota lidar renderizando um estado de carregamento e checando via `useActiveContext` + `canAccess` no cliente (rerender após hidratar redireciona). Concretamente:
  - Manter a guarda como antes para sessão, mas remover o `return` no ramo `role === null`.
  - Adicionar um utilitário `useEnforceModuleAccess(module)` chamado no topo das páginas restritas (ou centralizar via um wrapper no `_authenticated/route.tsx` que lê `role` do contexto e chama `navigate` quando `!canAccess`).
- Alternativa preferida (mais simples): manter `getCachedRole` mas persistir o papel também durante login (já é feito em `setCachedRole` via effect no provider). No primeiro acesso pós-login o cache já existe. Para o caso inicial sem cache, adicionar checagem cliente no `_authenticated/route.tsx` que observa `role` do contexto e, quando `role` estiver definido e o `pathname` não passar por `canAccess(modulo)`, faz `navigate({ to: landingPathForRole(role), replace: true })`.

Escolha: implementar a **guarda em nível de layout `_authenticated`** (via mapeamento pathname→ModuleKey), rodando após o `role` estar disponível — assim garantimos que `beforeLoad` (que não tem contexto assíncrono do provider) fica só como best-effort e a checagem definitiva acontece no cliente sempre que `role` muda.

### 3. Escopo por turma no MTE para professor/auxiliar

Nas abas do MTE (`mte.beneficiarias`, `mte.matriculas`, `mte.presencas`, `mte.aulas`, `mte.evidencias`, `mte.checklist`, `mte.cronograma`, `mte.ava`, `mte.importar-lista`), aplicar o mesmo padrão já usado em pedagogico:

- Buscar `instrutor_turmas` para o `user.id`.
- Se `role ∈ {professor, auxiliar_pedagogico}` e existir escopo, filtrar as consultas por `turma_id IN (escopo)`; se não houver turmas vinculadas, mostrar estado vazio com mensagem "Nenhuma turma vinculada ao seu usuário".
- Esconder botões de criação/importação globais para esses papéis (mantendo somente ações escopo-turma).

### 4. Documentação

Atualizar `docs/PERMISSOES.md` com a nova matriz e a nota sobre a guarda de layout.

## Detalhes técnicos

- Arquivos alterados:
  - `src/lib/role-access.ts` (matriz).
  - `src/lib/auth-guard.ts` (comportamento no ramo `role === null`).
  - `src/routes/_authenticated/route.tsx` (guarda em nível de layout observando `role`).
  - Rotas MTE citadas (filtro por escopo de turma).
  - `docs/PERMISSOES.md`.
- RLS no banco continua sendo a verdade — as mudanças aqui são de UX/roteamento.
- Coordenador_geral mantém 100% do acesso (está em todos os conjuntos).

## Verificação

- Typecheck limpo.
- Passar por cada URL restrita como "professor" e confirmar redirecionamento para `/pedagogico`: `/`, `/pendencias`, `/etapas`, `/administrativo`, `/financeiro`, `/captacao`, `/whatsapp`, `/base-conhecimento`, `/drive`, `/relatorios`, `/configuracoes`.
- Como "gestor_financeiro": bloqueio em `/`, `/pendencias`, `/etapas`, `/captacao`, `/base-conhecimento`; liberado em `/administrativo`, `/financeiro`, `/relatorios`.
- Coordenação geral vê tudo.
