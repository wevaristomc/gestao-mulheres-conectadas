
# Execução controlada — FRENTE 1 (RBAC), Fases 0 → 7

**Regras da execução:**
- Cada fase = 1 build isolado e testável.
- Fases com migration: entrego o SQL completo no chat; você roda manual no projeto `yqvocpnvunaprpmhlswn`; só então prosseguimos para a próxima fase dependente.
- Nunca chamar `supabase--enable`. Nunca editar `.env` nem `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`.
- Fase 8 (aposentar enum antigo) NÃO executar agora.
- Frente 2 (gaps) fica registrada em `.lovable/plan.md`, sem implementação.
- Ao concluir a Fase 7, publico.

---

## Fase 0 — Diagnóstico do "Carregando…" (sem migration) ⚙️ EXECUTAR AGORA

**Objetivo:** revelar por que `/configuracoes/usuarios` trava.

**Alterações:**
- `src/routes/_authenticated/configuracoes.usuarios.tsx`: adicionar um `DiagnosticoBox` (card âmbar, sempre visível no topo) mostrando `user.id`, `user.email`, `isLoadingRoles`, `role` detectado, `projetoId`, `projetosDisponiveis.length`, `isCoord`, `query.enabled`, `query.status`, `query.fetchStatus`, `query.error?.message`.
- Adicionar early return quando `isLoadingRoles` for `true` (indica que o `useEffect` que carrega `user_roles` ainda não terminou — hipótese principal, dado que auth logs mostram `bad_jwt`/`unrecognized JWT kid ES256`).
- Enriquecer o card "Apenas coordenação geral" para mostrar o papel efetivamente detectado.
- Enriquecer o card "Selecione um projeto ativo" para informar `projetosDisponiveis.length`.
- Nada tocado fora deste arquivo.

**Como validar:** abrir `/configuracoes/usuarios`; o painel de diagnóstico dirá exatamente qual é a causa. Se `role=null` com `isLoadingRoles=false`, o problema é que seu usuário não tem row em `user_roles` para o projeto ativo — nesse caso a Fase 1 (migration) já corrige. Se `isLoadingRoles=true` para sempre, é falha do bearer (JWT rejeitado no `/user`) — corrigimos no fim da Fase 0 com um segundo ajuste (timeout no `useEffect` do `use-active-context.tsx` para `setIsLoadingRoles(false)` mesmo sem sessão).

**Sem SQL nesta fase.** Você me diz o que o painel mostrou → sigo.

---

## Fase 1 — Migration RBAC base (SQL manual)

Novo enum `app_role_v2`, coluna `role_v2` + backfill, `permissoes_papel` (com seed inicial), `instrutor_turmas`, função `has_permission`, `audit_log`. Coluna `ativo` em `user_roles`. Enum antigo permanece intocado.

Entrego o SQL completo no chat quando você aprovar a fase; você roda manual; me confirma; sigo.

## Fase 2 — Hook `usePermissoes` + guardas de rota (sem migration)

Reescrever `src/lib/role-access.ts` mantendo API `canAccess` como wrapper. Criar `src/hooks/use-permissoes.tsx` que lê `permissoes_papel`. `requireModuleAccess` passa a checar `pode_ver` da tabela.

## Fase 3 — Policies RLS por módulo (SQL manual)

Reescrita das policies das tabelas por módulo usando `has_permission` + `instrutor_turmas`. SQL entregue uma tabela por vez (ou em blocos por módulo) para você aplicar controladamente.

## Fase 4 — Convite por e-mail + ativar/desativar (SQL + código)

Server fn `convidarUsuario` (usa `admin.auth.admin.inviteUserByEmail`). Trigger `on_auth_user_created` grava `user_roles.role_v2` a partir de `raw_user_meta_data.role_pretendida`. UI de reenviar convite e desativar.

## Fase 5 — Vínculo instrutor↔turmas (código; SQL da tabela já veio na Fase 1)

UI em `/configuracoes/usuarios/[id]/turmas`. Policies MTE/Pedagógico já filtram por `instrutor_turmas` desde a Fase 3.

## Fase 6 — Editor da matriz de permissões (código)

Nova rota `/configuracoes/permissoes` (admin) com grid checkbox por `role × modulo × acao`, escrevendo em `permissoes_papel`.

## Fase 7 — Auditoria (SQL + código)

Triggers em `user_roles`, `permissoes_papel`, `despesas`, `matriculas` gravando em `audit_log`. Server fns sensíveis (export, reset senha) inserem manualmente. Nova rota `/configuracoes/auditoria` (admin).

**Após a Fase 7 → publish.**

---

## Fase 8 — NÃO EXECUTAR AGORA

Dropar `role` antigo, renomear `role_v2` → `role`. Fica pendente até validação em produção.

---

## Frente 2 — NÃO IMPLEMENTAR AGORA

Gap analysis vs Plano de Trabalho MTE/SEMP 01025/2025 permanece registrado em `.lovable/plan.md` como backlog priorizado (P0 metas/rubricas/certificados em lote/exportações TransfereGov; P1 matriz curricular/calendário/comprovantes/pendências por perfil; P2 transparência/diário/notificações; P3 folha/OFX/assinatura). Não iniciar até nova aprovação.

---

## Riscos

- Se `SUPABASE_SERVICE_ROLE_KEY` do projeto correto (`yqvocpnvunaprpmhlswn`) não estiver disponível ao runtime, todas as chamadas `admin.auth.admin.*` falham; nesse caso convite/listagem não funcionam mesmo com policies certas. Fase 0 detecta.
- Auth logs mostram `bad_jwt / unrecognized JWT kid ES256`: sinal de rotação de signing keys no projeto Supabase. Se persistir após Fase 0, precisamos avaliar rotacionar chaves publicáveis — sem tocar em `.env` (Cloud reescreve), mas o hardcode em `client.ts` também está fora do escopo. Registro como risco visível.
- Reescrita de policies em Fase 3 pode cegar dados legítimos: aplicar por tabela, com script `SELECT` de verificação antes/depois.

---

**Aprove para eu iniciar pela Fase 0 (só um arquivo, sem SQL).**
