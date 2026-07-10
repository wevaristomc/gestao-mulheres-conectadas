## Objetivo

No diálogo de Nova/Editar aula (aba Aulas do Pedagógico), preencher automaticamente **Instrutor/a**, **Hora início** e **Hora fim** a partir dos dados já cadastrados na turma, quando a própria aula ainda não tiver esses campos.

Hoje esses campos ficam vazios mesmo com a turma tendo professor titular e horário definidos — o usuário precisa redigitar em cada aula.

## Regra de preenchimento

Para cada campo, usar a primeira fonte não-vazia:

- **Instrutor/a**: `aula.instrutor` → `turma.professor_nome`
- **Hora início**: `aula.hora_inicio` → `turma.hora_inicio` → parse de `turma.horario_realizacao` (padrão "HH:MM às HH:MM", "HH:MM-HH:MM", "HH:MMh às HH:MMh")
- **Hora fim**: `aula.hora_fim` → `turma.hora_fim` → parse de `turma.horario_realizacao`

Vale tanto no modo **Nova aula** (todos os campos vêm da turma) quanto **Editar aula** (só preenche o que estiver vazio na aula; se o usuário já digitou algo diferente, mantém).

O usuário continua podendo editar/sobrescrever qualquer campo antes de salvar — o pré-preenchimento é só um default visível no formulário.

## Mudanças

### `src/routes/_authenticated/pedagogico.turmas.$id.aulas.tsx`

1. A rota já carrega `turmaByIdOptions(turmaId)` para o card de comprovação — reaproveitar essa query e passar `turma` como prop para `AulaFormDialog` (evita segunda requisição).
2. Em `AulaFormDialog`:
   - Adicionar helper local `parseHorario(horario)` que extrai `{ inicio, fim }` no formato `HH:MM` de strings tipo "08:00 às 12:00", "8h às 12h", "08:00-12:00". Retorna `{ null, null }` se não casar.
   - Nos `useState` iniciais, aplicar o fallback descrito acima usando `turma.professor_nome`, `turma.hora_inicio`, `turma.hora_fim` e `parseHorario(turma.horario_realizacao)`.
   - Nada muda no submit — `salvar` já grava os cinco campos MTE via `upsertAula`.

Nenhuma outra rota, o gerador de PDF, `upsertAula`, migrations ou schema mudam. Só UI de formulário.

## Verificação

- Abrir uma aula existente sem instrutor/horário → os três campos aparecem preenchidos com dados da turma; salvar persiste na aula (o gerador de lista de presença passa a ler direto de `aulas.instrutor` / `hora_inicio` / `hora_fim`).
- Abrir aula que já tem instrutor próprio (diferente do da turma) → mantém o valor da aula.
- "Nova aula" numa turma com horário/professor definidos → campos já vêm preenchidos.
