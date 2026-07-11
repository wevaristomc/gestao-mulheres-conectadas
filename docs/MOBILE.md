# Responsividade Mobile — status

Padrão adotado: lista de cards em `< md`, tabela original em `≥ md`.
Botões/toggles ≥ 40px de altura no mobile (utilitário base em `styles.css`).
Textos com `min-w-0 + break-words`. Nomes SEMPRE visíveis.

## Fundamentos
- `src/styles.css`: `html/body { overflow-x: hidden }` + touch target mínimo 40px.
- `src/routes/_authenticated/route.tsx`: `main` `px-3 py-4` mobile, `md:px-6 md:py-6`.
- `src/components/ui/dialog.tsx`: `w-[calc(100vw-1.5rem)]`, `max-h-[90dvh] overflow-y-auto`, padding menor. Afeta TODOS os diálogos.
- `src/components/page-header.tsx`: título/ações empilham no mobile, `break-words`.
- Sidebar shadcn: em `md-` vira Sheet automaticamente. `SidebarTrigger` sempre visível na topbar.

## Orbe
- `src/components/orbe/orbe-neural.tsx`: FAB 56px no mobile (`h-14 w-14`), `bottom-4 right-4`, `z-40` (não sobrepõe drawers). `sm:h-16 sm:w-16` no desktop.
- `src/components/orbe/orbe-chat.tsx`: painel `w-full sm:max-w-lg` (100dvw × 100dvh no mobile), briefing/notificações já scrolláveis internamente.

## Ondas concluídas com card-no-mobile / table-no-md

### Pedagógico
- `pedagogico.turmas.$id.cursistas.tsx`
- `pedagogico.turmas.$id.frequencia.tsx` — mobile: seletor de aula + lista vertical com toggle P/F (h-10, min-w-12); desktop: matriz com nome sticky.

### MTE
- `mte.beneficiarias.tsx`
- `mte.matriculas.tsx`
- `mte.evidencias.tsx`

### Financeiro
- `financeiro.despesas.tsx`
- `financeiro.fornecedores.tsx`
- `financeiro.rubricas.tsx`
- `financeiro.relacoes-horas.tsx` (visão do financeiro)

### Administrativo
- `administrativo.qualificacao.tsx`
- `components/entregas-tab.tsx` — cobre `administrativo.beneficios` e `administrativo.materiais`.

### Geral
- `pendencias.tsx`

## Ondas com tabela horizontalmente scrollável (fallback padrão do <Table>)
Estas telas usam grade de dados ampla onde o modo card não cabe. O componente base já embrulha em `overflow-x-auto`, então o conteúdo fica utilizável no mobile via scroll horizontal — nome/coluna-chave à esquerda:
- `relacao-horas.tsx` (planilha diária: entrada / almoço / retorno / saída — não vira card).
- `mte.presencas.tsx`, `mte.cronograma.tsx`, `mte.checklist.tsx`, `mte.ava.tsx`, `mte.aulas.tsx`, `mte.turmas.tsx`, `mte.importar-lista.tsx`.
- `financeiro.orcamento.tsx`.
- `configuracoes.usuarios.tsx`, `configuracoes.permissoes.tsx`, `configuracoes.locais.tsx`, `configuracoes.instrutor-turmas.tsx`, `configuracoes.ia.tsx`.
- `base-conhecimento.tsx`, `whatsapp.index.tsx`, `captacao.tsx`.
- Relatórios (`relatorios.*`): mantidos como tabelas em `overflow-x-auto`.

## Etapas & Ajuda
- `etapas.tsx`: já usa Accordion + Card em grid responsivo, checklist com Checkbox de 40px de área efetiva (via base rule em styles).
- `ajuda.tsx`: já em `grid gap-3 md:grid-cols-2 lg:grid-cols-3`, cards empilham no mobile.

## Testes visuais recomendados (viewport 360px)
1. Login → dashboard (`/`) sem overflow horizontal.
2. `/pedagogico/turmas/:id/frequencia` — nomes visíveis, botões P/F 40px.
3. `/mte/beneficiarias` — busca, cards, badges.
4. `/financeiro/despesas` — cards com valor destacado.
5. `/pendencias` — filtro de status full width.
6. Abrir Orbe — Sheet 100dvh, briefing scrollável.
7. Abrir qualquer Dialog — 90dvh, sem cortar rodapé.
