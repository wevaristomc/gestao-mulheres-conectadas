
Trabalho grande em duas frentes independentes. Toda a DDL vai concentrada em `docs/migrations/rbac-e-relacao-horas.sql` — idempotente, você aplica no banco real. O código do app é ajustado no mesmo turno.

## A. RBAC efetivo

### Matriz (fonte única em `src/lib/role-access.ts`)
- `coordenador_geral`, `administrativo` → TODOS os módulos.
- `gestor_financeiro` → Visão Geral, Pendências, Financeiro, Relatórios (leitura), Relação de Horas (aprovação), Base de Conhecimento, Drive.
- `coordenador_pedagogico` → Visão Geral, Pendências, Pedagógico, MTE, Relatórios, WhatsApp, Base, Drive.
- `professor`, `auxiliar_pedagogico` → Visão Geral, Pendências, Pedagógico (só suas turmas), Base, Drive, Relação de Horas (própria).

Ajustes em `MODULE_ACCESS` + novo módulo `relacao-horas`. Sidebar já lê `canAccess`, então filtra sozinha. `requireModuleAccess` continua guardando cada rota.

### Filtro por turma para professor/auxiliar
Nas telas de Pedagógico que listam turmas (`pedagogico.index`, seletor de turmas) e MTE quando aplicável: quando `role ∈ {professor, auxiliar_pedagogico}`, aplicar `WHERE turma_id IN (SELECT turma_id FROM instrutor_turmas WHERE user_id = auth.uid())`. Fazer isso no client (queries do TanStack) para não depender de novas server-fns.

Nas rotas `/_authenticated/pedagogico/turmas/$id/*`, no `beforeLoad` (ou no componente), checar se o professor tem vínculo com aquela turma — se não, redirect para `/pedagogico`.

### RLS (na migração)
Criar helper `has_role_any(_roles app_role[])` (security definer). Substituir políticas "USING true" nas tabelas:

- Financeiro (`despesas`, `fornecedores`, `orcamento_itens`, `rubricas`, `cotacoes`, `cotacao_propostas`): SELECT/INSERT/UPDATE/DELETE para `gestor_financeiro | coordenador_geral | administrativo`.
- Pedagógico sensível (`aulas`, `frequencia`, `presencas`, `matriculas`, `evidencias_aula` se existir): coordenação total (`coordenador_geral | administrativo | coordenador_pedagogico`); professor/auxiliar SELECT/INSERT/UPDATE somente para linhas cuja `turma_id` está em `instrutor_turmas` do próprio user.
- Demais tabelas gerais: SELECT para `authenticated`, escrita para coordenação.

Server functions continuam usando service_role → não afetadas.

Toda a DDL é `DROP POLICY IF EXISTS ... ; CREATE POLICY ...` para ser idempotente.

## B. Módulo Relação de Horas

### Schema (na mesma migração)
```
relacoes_horas(id, user_id→auth.users, mes_referencia date, local_trabalho text,
  status text check in (rascunho,enviada,aprovada,rejeitada) default rascunho,
  total_horas numeric, valor_hora numeric, valor_total numeric,
  assinatura_nome text, assinatura_hash text, assinado_em, enviado_em,
  avaliado_por uuid, avaliado_em, observacao_avaliacao,
  criado_em, atualizado_em)
UNIQUE (user_id, mes_referencia)

relacoes_horas_itens(id, relacao_id fk ON DELETE CASCADE, data date,
  hora_entrada time, hora_saida time, total_horas numeric, valor_dia numeric)
```

`ALTER TABLE instrutor_turmas ADD COLUMN IF NOT EXISTS valor_hora numeric DEFAULT 40.00`.

RLS:
- Professor gerencia as próprias (`user_id = auth.uid()`), mas NÃO pode UPDATE/DELETE após `status ∈ (enviada, aprovada)`.
- `gestor_financeiro | coordenador_geral | administrativo`: SELECT total, UPDATE só de `status`, `avaliado_por`, `avaliado_em`, `observacao_avaliacao`.

Trigger `updated_at` padrão.

### Server functions em `src/lib/relacao-horas.functions.ts`
- `gerarRascunho({ mes })` → busca aulas do próprio user no mês (via `aulas` + `instrutor_turmas`) e cria/atualiza rascunho + itens. Um item por aula: data, hora_entrada=hora_inicio, hora_saida=hora_fim, total_horas=diff, valor_dia=total×valor_hora (média das turmas).
- `salvarItens({ relacaoId, itens })` — só quando status=rascunho.
- `assinarEEnviar({ relacaoId, nomeAssinatura })` → calcula SHA-256 sobre JSON canônico (`{ user_id, itens, timestamp }`), grava assinatura, muda status→enviada, cria row em `notificacoes` para gestores financeiros.
- `aprovar({ relacaoId, observacao? })` / `rejeitar({ relacaoId, observacao })` — protegidas por `has_role_any(['gestor_financeiro','coordenador_geral','administrativo'])`, criam notificação para o professor.
- `listarMinhas`, `listarPendentesFinanceiro`, `obterRelacao(id)`.

### Telas
- `/_authenticated/relacao-horas` (professor) — lista das próprias, seletor de mês, botão "Gerar do mês", editor de itens em tabela (dias 1..N do mês, dias sem aula em branco, sábado/domingo destacados), botão "Assinar e enviar" abre `Dialog` com input de nome + confirmação.
- `/_authenticated/financeiro/relacoes-horas` — lista `status=enviada` com badges, dialog de visualização (PDF preview) + aprovar/rejeitar com textarea de observação.
- Adicionar aba "Relações de Horas" em `financeiro.tsx`.

### PDF (`src/lib/relacao-horas-pdf.ts` usando `jspdf` já presente)
Título "Relação de Horas", "Prof.: {nome}", "Local de trabalho: {local}". Tabela: DATA | DIA DA SEMANA | HORA ENTRADA | HORA SAÍDA | Total Horas | Valor Hora Dia (R$). Header azul `#5B8BD0`, células de data também azul; sábados/domingos linha inteira azul sem horas. Rodapé com Σ horas e Σ R$. Bloco "Assinado digitalmente por {nome} em {data} — hash {8 primeiros}". Linha de assinatura do financeiro. Todos os dias do mês em sequência.

### Sidebar
Nova entrada "Relação de Horas" (icon `Clock`) no grupo apoio/módulos, visível para professor/auxiliar/gestor_financeiro/coordenador_geral/administrativo.

## Fora do escopo
- Não vou refatorar sign-in/oauth.
- Não vou tocar server functions existentes.
- Não vou aplicar DDL — você aplica `docs/migrations/rbac-e-relacao-horas.sql`.

## Critério de aceite
- Login como coordenador_geral: tudo funciona como hoje.
- Login como gestor_financeiro: só vê Financeiro/Relatórios/Relação de Horas (aprovação).
- Login como professor: só vê suas turmas; pode gerar/assinar Relação de Horas; PDF sai igual ao modelo.
- `bun run typecheck` limpo.
