## Contexto

Tanto **Pedagógico › Turma › Frequência** quanto **Fiscalização MTE › Presenças** leem e gravam na mesma tabela `presencas` (chave `aula_id + matricula_id`). Se os dados divergem para 09/06/2026 na BET-MC-02, a origem é quase sempre uma destas quatro causas — e algumas afetam também Relatórios.

### Hipóteses (em ordem de probabilidade)

1. **Mais de uma aula no mesmo dia** (ex.: turno manhã + tarde, ou CH geral + específico). A grade da Pedagógico cria **uma coluna por aula**; a chamada do MTE marca **uma aula por vez**. O usuário lê "09/06" como se fosse um único evento, mas a marcação foi feita na aula A e a coluna vazia é da aula B.
2. **Filtro de matrículas diferente**: MTE oculta cursistas com status `evadida`/`desistente`; Pedagógico mostra todas. A marca não muda, mas o **percentual de frequência** sim, e a lista "faltou" pode aparecer só num dos lados.
3. **"Fechar chamada" sobrescreve o que ainda não foi lançado como falta**. Se o Fechar chamada rodou antes de a chamada MTE ser concluída (ou vice-versa), o estado final depende de qual foi a última escrita.
4. **Cache desatualizado no navegador**: a mutação de um lado só invalida a query do outro se as `queryKey` combinarem — hoje invalidamos `["mte","presencas"]` e `["pedagogico","frequencia",turmaId]`, mas **não** `["pedagogico","aulas",turmaId]` nem `["relatorios", …]` específicos por turma. Efeitos raros de "some ao trocar de aba".

## Diagnóstico (passo 1)

1. Adicionar um pequeno painel de diagnóstico (só em dev/QA, atrás de query param `?debug=1`) na aba Frequência da turma que lista, para cada aula, `id`, `data`, `hora_inicio/hora_fim`, `tipo_ch`, `conteudo_programatico` e a contagem de `presencas` (P/F/sem marca). Isso confirma na hora se 09/06 tem 1 ou 2 aulas e onde estão as marcas.
2. Rodar essa checagem para a BET-MC-02 e anexar o resultado ao ticket — sem isso, qualquer correção é chute.

## Correções (passo 2, conforme achado)

### A. Se houver mais de uma aula em 09/06 (hipótese 1 — mais provável)

- Na grade de Frequência da Pedagógico, **agrupar visualmente as colunas do mesmo dia** sob um cabeçalho único "09/06/2026" e mostrar subcolunas com o turno/CH (ex.: "Manhã · Geral", "Tarde · Específico"). Deixa explícito por que existem duas colunas.
- No seletor mobile de aula (Pedagógico) e no seletor de aula do MTE, exibir também turno/CH ao lado da data, para o usuário não confundir aulas do mesmo dia.
- Em Relatórios › Frequência, garantir que o denominador do % use **todas** as aulas do período (é o que já fazemos hoje) e destacar quando há mais de uma aula no dia, para evitar leitura errada.

### B. Filtro de matrículas consistente (hipótese 2)

- Unificar a regra: nas três telas (Pedagógico Frequência, MTE Presenças, Relatórios Frequência), o padrão é **incluir todas** as matrículas ativas e **ocultar** `evadida`/`desistente` **a partir da data do evento** (não para toda a apuração). Adicionar toggle "Mostrar evadidas/desistentes" nas três, com o mesmo comportamento.

### C. "Fechar chamada" mais seguro (hipótese 3)

- Já é idempotente (só grava quem ainda não tem marca), mas exibir no diálogo a **lista das cursistas** que serão marcadas como falta antes de confirmar, para evitar fechar chamada antes de terminar o lançamento pelo MTE.
- Registrar `origem` (`pedagogico_fechar_chamada` | `mte_chamada` | `pedagogico_manual`) em `presencas` quando a coluna existir (retry pattern que já usamos noutros lugares), para auditoria futura sem quebrar bancos que não têm a coluna.

### D. Invalidação de cache completa (hipótese 4)

- Nas mutações de `upsertFrequencia`, `upsertFrequenciaBatch` e `upsertPresencaMTE`, invalidar também:
  - `["pedagogico","frequencia", turmaId]` (independente de quem gravou)
  - `["mte","presencas", aulaId]` e `["mte","presencas"]` (prefixo)
  - `["relatorios","frequencia"]` (prefixo)
  - `["pedagogico","aulas", turmaId]` (contadores por aula)
- Padronizar num helper `invalidateFrequenciaCaches(qc, { turmaId?, aulaId? })` para não esquecer nenhum lugar.

## Validação (passo 3)

1. Abrir BET-MC-02 › Frequência com `?debug=1` e confirmar quantas aulas existem em 09/06 e onde as marcas foram feitas.
2. Marcar uma cursista pelo MTE numa aula específica de 09/06 e verificar que a coluna correta da Pedagógico atualiza sem F5.
3. Rodar Relatórios › Frequência para a turma no período e conferir que o total bate com a soma das marcas visíveis nas duas telas.

## Não faz parte deste plano

- Mudar o schema de `presencas` (a chave `aula_id + matricula_id` está correta).
- Migrar dados históricos: só depois de confirmar o diagnóstico.
