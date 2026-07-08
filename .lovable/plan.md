## Diagnóstico

A importação consolidada QAJBC hoje só popula o MTE porque:

1. **Turmas ficam sem `projeto_id`.** Pedagógico, Administrativo e Relatórios filtram todas as leituras por `turmas.projeto_id = <projeto ativo>`. Sem essa coluna preenchida, as turmas importadas ficam invisíveis fora do MTE.
2. **`matriculas` só apontam para `beneficiarias`.** As telas fora do MTE fazem embed `matriculas → cursistas (*)`. Como não escrevemos `cursista_id`, o nome/CPF/e-mail das alunas nunca aparecem no Pedagógico nem na aba de Certificados do Administrativo.
3. **Nenhuma `aula` é criada.** Frequência média e Relatórios pedagógicos dependem de linhas em `aulas`. Hoje as 6 turmas ficam com 0 aulas, então frequência = 0 e "aulas previstas" = 0.
4. **Professor titular fica só em `turmas.professor_nome/email`.** Nenhuma tela do Pedagógico/Administrativo lê essas colunas — o dado importado existe mas é invisível.

## O que vou fazer (uma rodada, idempotente)

### 1. Enriquecer o importador consolidado (`src/lib/consolidado-qajbc.functions.ts`)

- Receber `projeto_id` do contexto ativo (input validado) e gravar em cada turma criada/atualizada.
- Para cada beneficiária importada, fazer upsert equivalente em `cursistas` (chave: CPF) copiando nome/CPF/e-mail/telefone. Guardar `cursista_id` retornado.
- Ao gravar `matriculas`, preencher tanto `beneficiaria_id` (MTE) quanto `cursista_id` (Pedagógico/Administrativo). Se a coluna `cursista_id` não existir, degradar silenciosamente e reportar em `inconsistencias`.
- Gerar esqueleto de **30 aulas de 5h** (150h de carga horária, seg–sex conforme `horario_realizacao`) por turma, começando em `data_inicio = 2026-05-09`. Idempotente: se já houver aulas para a turma, pular.
- Somar ao `ResumoConsolidado`: `cursistas_criados`, `cursistas_atualizados`, `aulas_criadas`, `turmas_com_projeto`.

### 2. Migração adicional (`docs/migrations/consolidado-pedagogico.sql`)

- Garantir que `matriculas.cursista_id uuid REFERENCES public.cursistas(id)` exista (idempotente com `ADD COLUMN IF NOT EXISTS`).
- Garantir índice único parcial em `cursistas (upper(cpf))` para permitir upsert por CPF.
- Nenhuma alteração de RLS além do que já existe.

### 3. Exibir professor titular no Pedagógico

- Em `src/routes/_authenticated/pedagogico.turmas.$id.tsx` (cabeçalho da turma) mostrar "Professor(a): {professor_nome} · {professor_email}" lido de `turmas`.
- Em `src/routes/_authenticated/pedagogico.index.tsx` adicionar coluna "Professor(a)" na listagem.

### 4. Botão "Reprocessar vínculos" no card existente

- No `src/components/mte/importar-consolidado-card.tsx`, adicionar uma segunda ação que roda o importador sobre dados já existentes (mesmo endpoint — é idempotente). O texto explicativo passa a mencionar que a importação alimenta Pedagógico, Administrativo e Relatórios além do MTE.

## O que NÃO vou mexer

- Card "Importação Consolidada QAJBC" e o botão original ficam intactos (mesma UX, ganham só o botão de reprocessamento).
- Cronograma do MTE, tela de fiscalização do Ofício 49148/2026 e Ciclo 2 previsto — sem mudanças.
- Nenhuma alteração de RLS, buckets ou schemas de auth.

## Detalhes técnicos

- Projeto ativo vem de `useActiveContext().projetoId` no cliente e é enviado como argumento validado da server-fn (Zod-style manual, mesmo padrão dos outros importadores).
- Se `projeto_id` vier nulo, a server-fn falha com mensagem clara "Selecione o projeto Manuel Querino / Mulheres Conectadas antes de importar."
- Reexecução é segura: turmas por `codigo_turma`, cursistas por CPF, matrículas por `(turma_id, beneficiaria_id)`, aulas por `(turma_id, ordem)`.
- Após rodar a migração `consolidado-pedagogico.sql`, o mesmo botão faz backfill total das 6 turmas + 270 alunas + 180 matrículas + ~180 aulas.

## Passos que o coordenador executa

1. Rodar `docs/migrations/consolidado-pedagogico.sql` no SQL Editor.
2. Selecionar o projeto ativo "Manuel Querino / Mulheres Conectadas" no topbar.
3. Em MTE → Importar Documento, clicar **"Rodar importação consolidada"** (ou o novo **"Reprocessar vínculos"** se já rodou antes).
4. Conferir em Pedagógico, Administrativo → Certificados e Relatórios se as 6 turmas e as alunas aparecem.