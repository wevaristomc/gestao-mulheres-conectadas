## Respostas rápidas

**1) Por que não consigo cadastrar turmas?**
Porque a tela `/pedagogico` ainda não tem UI de criação/edição. Ela só lista turmas do projeto ativo (`turmasListOptions` → `SELECT * FROM turmas`). Não existe botão "Nova turma", nem função `upsertTurma`, nem dialog. É por isso que aparece "Nenhuma turma cadastrada" e não há como inserir uma.

**2) Onde ficarão os Relatórios Inteligentes e o acompanhamento do projeto?**
Ainda não existem no código. Proponho criar um novo módulo `/relatorios` (rota `_authenticated/relatorios.*`), com abas para diferentes visões — o acompanhamento do projeto vira uma dessas abas.

---

## Plano

### Parte A — Cadastro de turmas (resolve o problema imediato)

1. **`src/lib/pedagogico-queries.ts`** — adicionar:
   - `upsertTurma({ id?, projeto_id, nome, turno?, data_inicio?, data_fim?, descricao? })` gravando em `turmas` (usa `nome` no payload; se o banco não tiver essa coluna e sim `titulo`, tentamos `nome` primeiro e caímos em `titulo` no catch, mesma tática de descoberta em runtime já usada no módulo).
   - `deleteTurma(id)`.

2. **`src/routes/_authenticated/pedagogico.index.tsx`**:
   - Botão "Nova turma" no `PageHeader` (desabilitado sem `projetoId`).
   - `TurmaDialog` (novo componente inline ou em `src/components/turma-dialog.tsx`) com campos: Nome*, Turno (manhã/tarde/noite/integral), Data início, Data fim, Descrição.
   - Ação "Editar" e "Excluir" (com `AlertDialog` de confirmação) por linha da tabela.
   - Gate de escrita: só `coordenador_geral` e `coordenador_pedagogico` veem os botões (via `useHasRole`).
   - Após salvar/excluir: `queryClient.invalidateQueries({ queryKey: ["pedagogico","turmas"] })` + toast.

3. **Sem migração de schema.** Mantemos a estratégia de descoberta em runtime: se `insert({ nome })` falhar com `column "nome" does not exist`, refaz com `{ titulo }`.

### Parte B — Módulo de Relatórios Inteligentes e Acompanhamento

Novo módulo top-level `/relatorios`, acessível a `coordenador_geral`, `coordenador_pedagogico` e `gestor_financeiro` (ajustável).

Estrutura de rotas:

```text
src/routes/_authenticated/
  relatorios.tsx                 (layout + guard)
  relatorios.index.tsx           (redireciona para acompanhamento)
  relatorios.acompanhamento.tsx  (visão geral do projeto: metas × realizado)
  relatorios.pedagogico.tsx      (frequência, evasão, aulas dadas por turma)
  relatorios.financeiro.tsx      (execução orçamentária, custo aluno-hora)
  relatorios.qualificacao.tsx    (cursistas qualificados, certificados emitidos)
  relatorios.inteligente.tsx     (resumo gerado por IA via Lovable AI Gateway)
```

Conteúdo de cada aba (na 1ª entrega, focar em Acompanhamento + Inteligente; as outras entram em iterações seguintes):

- **Acompanhamento do projeto**: cards com nº de turmas, aulas realizadas × previstas, cursistas ativos, taxa de frequência média, % de execução do orçamento, dias restantes de vigência. Dados agregados a partir de `turmas`, `aulas`, `matriculas`, `frequencias/presencas`, `despesas`, `projetos`.
- **Relatório Inteligente**: botão "Gerar resumo executivo" que chama um `createServerFn` (`src/lib/relatorios.functions.ts`) protegido por `requireSupabaseAuth`. A função monta um resumo dos KPIs do projeto ativo e envia para o Lovable AI Gateway (`google/gemini-2.5-flash`) pedindo um parecer em português com: pontos fortes, riscos, recomendações. Resposta renderizada em Markdown na tela. Requer habilitar o AI Gateway.
- Demais abas: gráficos (recharts, já disponível via shadcn/ui) e tabelas com os mesmos dados agregados.

Ajustes complementares:

- `src/lib/role-access.ts`: adicionar `"relatorios"` em `ModuleKey` e `MODULE_ACCESS`.
- `src/components/app-sidebar.tsx`: adicionar item "Relatórios" (ícone `BarChart3`).
- `src/lib/relatorios-queries.ts`: funções agregadoras reutilizáveis.

### Fora do escopo desta rodada

- Não vou mexer no schema do Supabase.
- Não vou implementar todas as 4 abas de relatórios de uma vez — a rodada entrega **cadastro de turmas + módulo Relatórios com Acompanhamento e Relatório Inteligente**. Pedagógico/Financeiro/Qualificação viram próxima iteração se você aprovar.

---

## Perguntas antes de eu executar

1. Confirma que quer **cadastro de turmas + Relatórios (Acompanhamento + IA)** nesta rodada, e as outras 3 abas de relatórios depois? Se preferir escopo menor (só turmas, ou só relatórios), me diga.
2. Habilito o **Lovable AI Gateway** agora para o Relatório Inteligente funcionar? (Sem ele, a aba fica desabilitada.)
3. Quem deve ver o módulo Relatórios? Sugestão: `coordenador_geral`, `coordenador_pedagogico`, `gestor_financeiro`. Confirma?
