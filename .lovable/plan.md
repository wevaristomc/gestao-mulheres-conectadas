## Problema

O formulário de "Nova aula" na aba Pedagógico → Turma → Aulas grava só `data`, `titulo`, `duracao`. O gerador da Lista de Frequência (e o diálogo "Gerar listas de presença") lê os campos oficiais MTE da mesma tabela `aulas`: `conteudo_programatico`, `ch_prevista`, `hora_inicio`, `hora_fim`, `instrutor`. Resultado: aulas criadas pela UI pedagógica aparecem como "(sem tema)", "—h", e o PDF sai com Conteúdo/Horário/CH/Instrutor em branco.

## Correção (só frontend, sem migração)

Uma única alteração de escopo, em 2 arquivos, mantendo compatibilidade com aulas antigas:

### 1. `src/lib/pedagogico-queries.ts` — `upsertAula`
Estender a assinatura e o payload para incluir os campos MTE canônicos:
- `conteudo_programatico?: string | null`
- `ch_prevista?: number | null` (em horas; substitui `duracao` em minutos)
- `hora_inicio?: string | null` (HH:MM)
- `hora_fim?: string | null` (HH:MM)
- `instrutor?: string | null`

Continuar aceitando `titulo`/`duracao` no input (não quebra chamadas antigas), mas também gravar espelhado em `conteudo_programatico`/`ch_prevista` quando o form novo enviar — assim a lista de presença já sai preenchida.

### 2. `src/routes/_authenticated/pedagogico.turmas.$id.aulas.tsx` — `AulaFormDialog`
Ampliar o formulário para os campos oficiais, mantendo layout compacto:
- Data (já existe)
- Tema / Conteúdo programático (input longo) → grava em `conteudo_programatico`
- Instrutor/a
- Hora início / Hora fim (dois `type="time"` lado a lado)
- Carga horária prevista (horas, decimal aceito) → grava em `ch_prevista`

Pré-preencher em edição lendo `conteudo_programatico ?? titulo ?? tema`, `ch_prevista ?? duracao`, `hora_inicio`, `hora_fim`, `instrutor` — aulas legadas abrem no formulário sem perder dados e, ao salvar, migram para as colunas MTE.

Na tabela da aba Aulas, ajustar `pickFirst` das colunas:
- Tema: `["conteudo_programatico", "titulo", "tema", "assunto", "descricao"]`
- Duração: mostrar `ch_prevista` como "Nh" quando presente; senão `duracao` como antes.

### 3. Nada mais muda
Não mexer no gerador PDF (`lista-presenca-gerador.ts`), no diálogo (`dialog-gerar-listas.tsx`), nas rotas MTE, nem em migração — as colunas MTE já existem em `aulas` (comprovado por `src/lib/mte-queries.ts`).

## Verificação
Após aplicar: build limpo, criar nova aula com todos os campos, abrir "Gerar listas de presença", confirmar que a linha mostra o tema e a CH, gerar PDF e conferir Conteúdo/Instrutor/Horário/CH preenchidos.
