## Problema

Ao gerar listas de presença (diálogo "Gerar listas"), dois sintomas:

1. **Na tela**: para aulas antigas cadastradas antes do MTE, a coluna do tema mostra "(sem tema)" porque só lê `conteudo_programatico` — dados legados vivem em `titulo` / `tema` / `assunto` / `descricao`.
2. **No PDF gerado**: campos Instrutor/a, Hora início, Hora fim e Carga horária vêm em branco quando a aula não os tem preenchidos, mesmo com a turma já tendo esses dados cadastrados. O gerador só usa `aula.*` — não faz fallback para a turma como a tela de "editar aula" já faz.

## Solução

Aplicar no diálogo o mesmo padrão de fallback já usado no `AulaFormDialog`: cada campo puxa da aula quando existir, senão da turma, senão do parse de `turma.horario_realizacao`. Sem tocar em migrations, gerador de PDF/XLSX/DOCX, `upsertAula`, ou outras rotas.

## Mudanças

### `src/components/pedagogico/dialog-gerar-listas.tsx`

1. Carregar também a linha bruta da turma (`turmaByIdOptions(turmaId)` de `@/lib/pedagogico-queries`) além de `turmasMteListOptions`. A primeira já tem `professor_nome`, `hora_inicio`, `hora_fim`, `horario_realizacao` que a versão MTE não expõe.

2. Adicionar helper local `parseHorario(horario)` idêntico ao do `AulaFormDialog` — extrai `{ inicio, fim }` no formato `HH:MM` de strings como "08:00 às 12:00", "8h às 12h", "08:00-12:00".

3. Renderização da lista de aulas (`<ul>` com checkboxes): mudar `a.conteudo_programatico ?? "(sem tema)"` para usar `pickFirst(a, ["conteudo_programatico", "titulo", "tema", "assunto", "descricao"])`, e a CH para `pickFirst(a, ["ch_prevista", "duracao", "carga_horaria"])`. Assim aulas antigas mostram o tema real na tela.

4. `construirLista(turma, aula, cursistas, extras)`: aceitar também o `turmaRow` bruto e aplicar fallback por campo:
   - `tema`: `aula.conteudo_programatico` → `aula.titulo` → `aula.tema`.
   - `cargaHoraria`: `aula.ch_prevista` → `aula.duracao` → `turma.ch_total / turma.qtd_dias_curso` quando ambos existirem, formatado com `h`.
   - `instrutor`: `aula.instrutor` → `turmaRow.professor_nome` → `turmaRow.instrutor`.
   - `horaInicio`: `aula.hora_inicio` → `turmaRow.hora_inicio` → `parseHorario(turmaRow.horario_realizacao).inicio`.
   - `horaFim`: análogo para o fim.

Nenhuma alteração no gerador (`src/lib/lista-presenca-gerador.ts`) — ele já respeita os campos que receber; o problema é só o preenchimento upstream.

## Verificação

- Abrir o diálogo numa turma com aulas antigas (só `titulo`/`duracao` preenchidos) → coluna de tema mostra o texto real e CH aparece na lateral direita.
- Gerar PDF de aula sem instrutor/horário próprios, mas com turma que tem `professor_nome` e `horario_realizacao` "08:00 às 12:00" → cabeçalho institucional mostra o instrutor da turma e "08:00 às 12:00" no campo "Horário de Início e Fim das Aulas".
- Aula que já tem instrutor/horário próprios → mantém os valores da aula (fallback só entra em branco).
