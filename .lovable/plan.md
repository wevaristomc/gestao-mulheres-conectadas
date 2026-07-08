
## Análise de viabilidade

Hoje o import do Moodle já preenche as tabelas espelho `ava_*` e faz dois cruzamentos:
- `ava_users.beneficiaria_id` ← `beneficiarias` por CPF
- `ava_courses.turma_id` ← `turmas` por `codigo_turma`/`shortname`

Ou seja, os dados estão no banco, mas **espelhados**, não escritos nas tabelas operacionais (`turmas`, `beneficiarias`, `matriculas`, `aulas`). É totalmente viável promover esse espelho para as tabelas reais — com ressalvas por tipo de dado.

### O que dá para materializar com segurança

| Origem AVA | Destino | Confiança | Observação |
|---|---|---|---|
| `ava_courses` (com `turma_id NULL`) | `turmas` | Média | Só temos `shortname`, `fullname`, `startdate`, `enddate`. Campos MTE obrigatórios (`horario_realizacao`, `local_endereco`, `contato_local_nome`, `municipio`, `ciclo`, `turno`, CH, vagas) **não existem no Moodle** — turma criada nasce incompleta e precisa ser completada manualmente. |
| `ava_users` (com `beneficiaria_id NULL` e CPF válido) | `beneficiarias` | Baixa/Média | Moodle tem `firstname`, `lastname`, `email`, `cpf`. Faltam: `data_nascimento`, `genero`, `raca`, endereço, `municipio`, NIS, dados bancários. Criaria beneficiária com ficha incompleta (bloqueia relatórios MTE). |
| `ava_enrolments` (user+course já cruzados) | `matriculas` | **Alta** | É o caso mais direto: se `ava_user_id` tem `beneficiaria_id` e `ava_course_id` tem `turma_id`, dá para inserir `matriculas (turma_id, beneficiaria_id)`. Já existe índice único `(turma_id, beneficiaria_id)`, então é idempotente por `upsert`. Status derivável de `ava_enrolments.status` + `ava_completions`. |
| `ava_activities` | `aulas` | **Não recomendado** | "Aulas" no sistema são encontros presenciais com data/horário/CH; atividades do Moodle são recursos/tarefas do EAD. Semânticas diferentes — misturar polui frequência e certificação. |

### Recomendação

Fazer **três passos opt-in** após o import, e **não** materializar aulas:

1. **Matrículas automáticas** (ganho imediato, risco baixo): botão "Gerar matrículas a partir do AVA" que faz `upsert` em `matriculas` para todo par (`ava_user.beneficiaria_id`, `ava_course.turma_id`) já cruzado, com `status` derivado (`cursando`/`concluinte`/`evadida`) a partir de `ava_enrolments.status`/`timeend` e presença de conclusões.
2. **Beneficiárias a partir do AVA** (opt-in por linha): tela de revisão listando `ava_users` com CPF válido e `beneficiaria_id NULL`, permitindo selecionar quais criar. Cria a beneficiária com o mínimo (`nome`, `cpf`, `email`) e marca como "cadastro incompleto" para completar depois.
3. **Turmas a partir do AVA** (opt-in por linha, com wizard): tela listando `ava_courses` sem `turma_id`, pré-preenchendo `codigo_turma=shortname`, `nome_curso=fullname`, `data_inicio/data_fim` — usuária confirma e completa os campos MTE obrigatórios antes de salvar.

Aulas continuam sendo criadas pelo cronograma pedagógico atual; o AVA passa a alimentar frequência/notas de forma **paralela** (já feito na tela `mte.ava`), não a ser fonte de verdade das aulas.

### Escopo desta implementação (proposto)

Só o **passo 1** nesta primeira entrega, que é o mais seguro e o de maior valor:

- Server function `gerarMatriculasDoAva` (createServerFn, admin) que:
  - Busca pares únicos (`ava_enrolments` → `beneficiaria_id`, `turma_id`) onde ambos estão preenchidos.
  - Deriva `status`: `concluinte` se existir `ava_grades.itemtype='course'` com `finalgrade > 0` **e** `timeend` no passado; `evadida` se `ava_enrolments.status = 1`; senão `cursando`.
  - `upsert` em `matriculas` com `onConflict: turma_id,beneficiaria_id`, gravando `observacao_importacao='Gerada via AVA <importacao_id>'`.
  - Retorna `{ criadas, atualizadas, ignoradas }`.
- UI: novo card em `mte.importar-lista` (abaixo do card do dump) com botão "Gerar matrículas do AVA" e um resumo.

Passos 2 e 3 ficam como fase seguinte, precisam de UI de revisão (não é seguro criar em lote sem confirmação por causa dos campos MTE obrigatórios).

### Perguntas antes de eu começar

1. Fecho o escopo desta entrega **só no passo 1 (matrículas automáticas)**, ou você quer os três já?
2. Para status derivado, tudo bem usar a regra acima ou prefere sempre `cursando` e deixar a coordenação ajustar?
