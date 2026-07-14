## Plano de correção

1. **Confirmar a causa no código**
   - A importação de lista de presença hoje procura aula existente apenas por `turma_id + data`.
   - Em dias com mais de uma aula, como 09/06/2026, isso pode atualizar/gravar presença na aula errada do mesmo dia, especialmente a aula da noite.

2. **Corrigir a importação de lista para distinguir aulas do mesmo dia**
   - Alterar a busca da aula existente para usar também horário (`hora_inicio`/`hora_fim`) quando a lista trouxer horário.
   - Se houver várias aulas na mesma data e o horário da lista não for suficiente, evitar sobrescrever a primeira aula do dia automaticamente.
   - Preservar compatibilidade para listas antigas sem horário quando só existir uma aula naquela data.

3. **Melhorar a ordenação e rótulos das aulas**
   - Ordenar aulas por `data + hora_inicio`, não apenas por data, em Pedagógico, MTE e relatórios/listas.
   - Mostrar horário e tipo de CH nas telas/listas onde ainda aparece só a data, para a aula noturna ficar inequívoca.

4. **Uniformizar o cálculo da apuração**
   - Ajustar relatórios/lista detalhada para usar a mesma base de matrículas ativas já usada em Pedagógico/MTE, evitando que evadidas/desistentes distorçam totais.
   - Calcular presença/falta por aula real, usando `presencas.aula_id + matricula_id` como fonte única.

5. **Adicionar diagnóstico visível apenas quando necessário**
   - Manter/ajustar `?debug=1` para destacar especificamente aulas duplicadas por data, contagens P/F/sem marca e IDs curtos da aula.
   - Isso ajuda a validar 09/06/2026 noite sem poluir a tela normal.

6. **Validação final**
   - Conferir no preview a turma BET-MC-02 em 09/06/2026, aula noturna.
   - Verificar que Pedagógico, Fiscalização MTE e Relatórios apontam para a mesma aula e os mesmos totais.