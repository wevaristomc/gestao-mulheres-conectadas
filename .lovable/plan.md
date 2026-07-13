Vou corrigir dois pontos relacionados em Configurações:

1. **Instrutores → Turmas**
   - Ajustar a leitura das turmas para usar a coluna correta de nomenclatura: `codigo_turma`.
   - Exibir `JBT-MC-01`, `BET-MC-01` etc. como texto principal, em vez de mostrar o começo do UUID como `34119aa5`.
   - Manter fallback seguro somente se a turma realmente não tiver `codigo_turma`, `codigo` ou `nome`.

2. **Erro “Não foi possível carregar o projeto / TypeError: Failed to fetch”**
   - Remover a dependência direta do carregamento do projeto via chamada do navegador nessa tela.
   - Criar/usar uma função segura no backend para carregar os dados do projeto autenticado, evitando falhas de fetch no preview e mantendo o acesso protegido.
   - Atualizar a tela de Configurações para consultar e salvar os dados do projeto por essa função/backend, mantendo o comportamento atual dos campos.

3. **Banco de dados**
   - A inspeção mostrou que as tabelas esperadas (`projetos`, `turmas`, `instrutor_turmas`) não aparecem no backend atual, enquanto o código espera essas tabelas.
   - Vou preparar uma migração idempotente para garantir a estrutura mínima necessária dessas tabelas, incluindo permissões de acesso e regras de segurança, e preservar os dados existentes se as tabelas já existirem em outro ambiente.

4. **Validação**
   - Depois de implementar, validar a tela de Configurações e a aba Instrutores → Turmas para confirmar que a turma aparece como `JBT-MC-01` e que o projeto carrega sem o erro de fetch.