## Onde estamos vs PRD (PROMPT 0 — Fund)

O PRD original pede: shell + auth + papéis + 8 rotas + Visão Geral com 4 KPIs preenchidos por Supabase + Pendências (com sino no topbar) + módulos vazios prontos para receber leituras reais.

Status atual:

| Área | Estado |
|---|---|
| Shell (sidebar, topbar, layout) | ✅ pronto |
| Auth (login, reset, troca de senha, primeiro admin) | ✅ pronto |
| RLS + papéis (`user_roles`, `has_role`) | ✅ desbloqueado hoje |
| Configurações → Usuários | ✅ CRUD completo |
| Visão Geral — 4 KPIs | 🟡 cards renderizam "—" (nunca consultam Supabase) |
| Pendências | 🔴 placeholder |
| Sino de pendências no topbar | 🔴 sem contador real |
| Pedagógico / Administrativo / Financeiro / Captação | 🔴 placeholders |
| Base de Conhecimento | 🔴 placeholder |

Módulos de negócio (Pedagógico → matrícula/frequência/entregas, Financeiro → orçamento/despesas, Captação → fornecedores/cotações, etc.) são um esforço grande e ainda não foram detalhados no PRD. O **próximo passo canônico do PRD** é fechar a fundação: Visão Geral com números reais + Pendências funcionando + sino ligado. Só depois abrimos o escopo de cada módulo.

## Próximo passo proposto

**Fase 1 — Fechar a fundação lendo do Supabase (uma sessão de trabalho)**

1. **Visão Geral com KPIs reais**, escopados pelo `projetoId` ativo do `useActiveContext`:
   - `Cursistas ativas` = `count(cursistas)` via `matriculas` do projeto com `status = 'ativa'`.
   - `Turmas em andamento` = `count(turmas)` do projeto com data corrente entre `data_inicio` e `data_fim` (ou `status = 'em_andamento'` — a decidir ao inspecionar o schema).
   - `Execução orçamentária` = `sum(despesas.valor) / sum(orcamento_itens.valor)` do projeto, formatado como %.
   - `Pendências abertas` = `count(pendencias)` do projeto com `status = 'aberta'`.
   - Usar TanStack Query (`useQuery`) por KPI, com Skeleton enquanto carrega e fallback "—" em caso de erro/vazio.

2. **Sino do topbar**: reusar o mesmo count de pendências abertas e mostrar badge com o número; clique navega para `/pendencias`.

3. **/pendencias**: tabela real com colunas `titulo`, `tipo`, `prioridade`, `responsavel`, `prazo`, `status`, filtro por status (Aberta / Em andamento / Resolvida) e busca por texto. Sem CRUD nesta fase — só leitura + link para a origem quando existir.

4. **Selector de projeto no topbar** (se houver mais de um projeto visível ao usuário): garantir que os KPIs e pendências reagem a `setProjetoAtivo`.

5. **Estados de erro/RLS**: se uma query retornar erro, o card mostra "Sem acesso" em vez de quebrar — importante enquanto policies de outras tabelas ainda não foram revisadas.

**Fora do escopo desta fase:** módulos Pedagógico/Administrativo/Financeiro/Captação/Base de Conhecimento continuam placeholders — cada um vai virar seu próprio PRD depois.

## Perguntas antes de eu escrever a Fase 1

Preciso confirmar o schema para não sair chutando nomes de coluna:

1. Você quer que eu leia o schema real do Supabase (via `supabase.from(...).select(...).limit(0)` ou olhando `src/integrations/supabase/types.ts` gerado) e derive os KPIs pelas colunas que existem, ou você me passa os nomes exatos das colunas de `cursistas`, `turmas`, `orcamento_itens`, `despesas` e `pendencias`?

2. Quando um usuário tem acesso a **mais de um projeto**, o `projeto_id` ativo já persiste em `localStorage` — o topbar deve ganhar um dropdown de projetos agora, ou fica implícito (primeiro projeto do usuário) até termos mais de um cadastrado?

Assim que responder, eu abro a Fase 1 em build mode.