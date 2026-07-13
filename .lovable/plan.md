## Diagnóstico

O erro vem de uma inconsistência entre dois modelos de papel:

- **Usuários** usam papéis atuais/legados: `Coordenação Geral`, `Gestão Financeira`, `Administrativo`, `Coordenação Pedagógica`, `Professor(a)`, `Auxiliar Pedagógico`.
- **Matriz de Permissões** tenta usar papéis novos: `Admin`, `Coordenador`, `Instrutor`, `Financeiro`, `Parceiro MTE`, `Captação`.

Além disso, no banco atual a tabela `permissoes_papel` **não existe**, então a matriz exibida não está sendo a fonte real de bloqueio. O sistema cai no fallback antigo (`role-access.ts`).

Sobre o professor ver todas as abas: o acesso depende do papel efetivo carregado em `useActiveContext`. Se o usuário tiver mais de um papel, o código escolhe automaticamente o de **maior privilégio**. Ou seja: se a pessoa aparece como `Professor(a)` em uma linha, mas também possui `Coordenação Geral`, `Administrativo` ou outro papel mais alto no mesmo projeto ou global, ela continuará vendo tudo.

## Plano de correção

1. **Unificar os nomes dos papéis**
   - Alterar a tela da Matriz de Permissões para usar os mesmos papéis mostrados em Configurações → Usuários:
     - Coordenação Geral
     - Gestão Financeira
     - Administrativo
     - Coordenação Pedagógica
     - Professor(a)
     - Auxiliar Pedagógico
   - Remover/evitar os nomes novos (`Admin`, `Coordenador`, `Instrutor`, etc.) nessa tela para não confundir a gestão.

2. **Criar/ajustar a tabela real da matriz de permissões**
   - Criar a tabela `permissoes_papel` no backend, se ainda não existir.
   - Preencher permissões iniciais a partir da matriz atual de acesso do app.
   - Garantir acesso protegido: usuários autenticados podem consultar, e somente Coordenação Geral pode alterar.

3. **Fazer menu e rotas usarem a matriz do banco**
   - Atualizar o hook de permissões para consultar `permissoes_papel` com os papéis atuais.
   - Atualizar a sidebar para esconder abas com base na matriz carregada, não apenas no fallback fixo.
   - Manter estado de carregamento para não mostrar todas as abas antes de carregar o papel/permissões.

4. **Corrigir papel efetivo do usuário**
   - Ajustar a leitura de papéis para considerar `ativo` quando a coluna existir.
   - Deixar claro no comportamento: se houver papel global ou duplicado de maior privilégio, ele prevalece; caso contrário, `Professor(a)` deve ver somente módulos permitidos.

5. **Revalidar as telas de Configurações**
   - Confirmar que `Professor(a)` não acessa Configurações, Financeiro, Administrativo etc.
   - Confirmar que Coordenação Geral continua podendo editar usuários, instrutores/turmas e matriz de permissões.
   - Confirmar que a Matriz de Permissões mostra nomes coerentes com a tela de usuários.