## Plano

1. **Liberar o encolhimento correto do layout principal**
   - Ajustar o layout autenticado para que o conteúdo ao lado do menu lateral tenha `min-w-0`.
   - Isso evita que a grade larga empurre a página inteira e fique escondida atrás da barra lateral.

2. **Conter a grade de frequência em uma área rolável própria**
   - Ajustar a página da turma e a subaba Frequência para que os wrappers usem largura máxima do viewport disponível.
   - Transformar a matriz de datas em um bloco com rolagem horizontal própria, sem depender da rolagem da página.

3. **Melhorar a usabilidade da grade larga**
   - Manter a coluna “Cursista” fixa à esquerda.
   - Garantir que a barra horizontal fique acessível e que seja possível chegar até a última data.
   - Evitar que o topo/abas ou o menu lateral cubram as colunas.

4. **Validar visualmente no mesmo cenário do print**
   - Abrir a rota de Frequência da turma.
   - Confirmar que a rolagem horizontal percorre todas as datas até a última coluna, com a coluna de nomes fixa.

## Detalhes técnicos

- Arquivos previstos:
  - `src/routes/_authenticated/route.tsx`
  - `src/routes/_authenticated/pedagogico.turmas.$id.tsx`
  - `src/routes/_authenticated/pedagogico.turmas.$id.frequencia.tsx`
- Ajustes principais:
  - adicionar `min-w-0` em containers flex/grid relevantes;
  - trocar o wrapper da tabela para um contêiner com `overflow-x-auto`, `max-w-full` e largura calculada de forma segura;
  - remover a dependência do wrapper interno padrão do componente `Table` quando necessário, para não criar rolagem aninhada/travada.