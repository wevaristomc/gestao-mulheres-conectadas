## Ajustes na Frequência (Pedagógico › Turma)

Dois problemas separados na tela `pedagogico.turmas.$id.frequencia.tsx`.

### 1. Rolagem horizontal encoberta pela barra lateral

Sintoma: em turmas com muitas aulas, a matriz cresce além da largura do conteúdo e a barra lateral (sidebar) fica sobre as últimas colunas — o `overflow-auto` local não segura o crescimento porque um ancestral flex não tem `min-w-0`, então o próprio `<main>` estica horizontalmente.

Correção (apenas layout / CSS, sem mexer em dados):

- Garantir que o container da matriz seja o único responsável pela rolagem horizontal:
  - Envolver a `<Table>` desktop em um wrapper com `w-full max-w-full overflow-x-auto` e largura mínima interna (`min-w-max` no elemento da tabela) para forçar a barra de scroll dentro da caixa, e não na página.
- Adicionar `min-w-0` no contêiner-pai imediato (o `<div className="space-y-3">` da página) para que ele possa encolher dentro do `<main>` flex.
- Se necessário, aplicar `min-w-0` também no `<main>` do layout autenticado (`src/routes/_authenticated/route.tsx`) para que o `SidebarInset` não permita que o conteúdo empurre a página inteira.
- Manter a coluna "Cursista" com `sticky left-0` como já está; adicionar `bg-background` também nas células (`TableCell`) para não vazar quando rola.

Nenhuma alteração em query, ordenação ou marcação de presença.

### 2. Fechar chamada: não marcados = falta

Hoje, cada checkbox faz upsert individual. Quem nunca foi marcado não gera linha em `presencas`/`frequencias`, então relatórios que contam registros explícitos podem tratar como "sem dado" em vez de "falta". O usuário quer um passo explícito de fechamento por aula.

Escopo:

- Adicionar botão **"Fechar chamada"** por aula, tanto no cabeçalho da coluna (desktop, ao lado do link de comprovação) quanto no bloco mobile (topo da lista de cursistas), com ícone e tooltip "Marcar não marcados como falta".
- Ao clicar:
  1. Confirmação simples (`AlertDialog`): "Marcar como falta todas as cursistas ainda não lançadas nesta aula?" com contagem prévia (ex.: "12 cursistas serão marcadas como falta").
  2. Executa um upsert em lote via `upsertFrequenciaBatch` (novo helper em `src/lib/pedagogico-queries.ts`) inserindo `presente = false` para cada `matricula_id` da turma que ainda não tem linha para aquela `aula_id`.
  3. Otimista: adiciona as linhas ao cache `["pedagogico","frequencia",turmaId]` e invalida em seguida `["mte","presencas"]`, `["mte","matriculas"]` e `["relatorios"]` — mesmos alvos que o `upsertFrequencia` atual já invalida.
- O botão fica desabilitado quando todas as cursistas já têm status lançado para aquela aula.
- Sem "modo rascunho": marcar P/F individualmente continua salvando na hora como hoje; o botão apenas fecha o restante como falta.

### Detalhes técnicos

- Novo helper em `pedagogico-queries.ts`:
  ```ts
  export async function upsertFrequenciaBatch(rows: FrequenciaRow[]): Promise<void>
  ```
  Reusa a lógica de detecção de tabela (`frequencias` ou `presencas`) e faz um único `upsert` com `onConflict: "aula_id,matricula_id"`.
- Cálculo dos "não marcados" por aula é feito no cliente com o `freqIndex` já existente + `cursistasRaw`.
- UI: `AlertDialog` de shadcn; ícone `CheckCheck` (lucide-react) para o botão.
- Nada muda em RLS/migrations nem em `mte-queries.ts` ou `relatorios-queries.ts`.

### Fora do escopo

- Reabrir chamada / desmarcar em lote.
- Fechar automaticamente ao sair da aula (sempre exige clique explícito).
- Aplicar o mesmo botão na tela Fiscalização MTE › Presenças (essa já opera por aula única).
