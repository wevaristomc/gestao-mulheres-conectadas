## Diagnóstico

O problema atual tem duas causas principais:

1. A tela de permissões está falhando ao carregar a matriz real e cai no fallback, por isso aparece tudo como “—” e as regras não são aplicadas como esperado. O erro registrado é:
   `invalid input value for enum app_role_v2: "coordenador_geral"`.
2. Parte do bloqueio ainda usa a matriz fixa antiga no frontend (`canAccess`) enquanto outra parte tenta usar a tabela de permissões. Isso deixa o comportamento inconsistente: Coordenador perde acesso para configurar e outros perfis continuam enxergando abas indevidas.

## Plano de correção

1. **Corrigir a fonte única de permissões**
   - Ajustar a consulta da matriz para não depender do enum problemático no filtro direto.
   - Garantir que a tela “Configurações → Permissões” carregue os registros reais da tabela de permissões.
   - Manter os nomes dos papéis exatamente como aparecem em “Configurações → Usuários”: Coordenação Geral, Gestão Financeira, Administrativo, Coordenação Pedagógica, Professor(a), Auxiliar Pedagógico.

2. **Restaurar permissão do Coordenador Geral**
   - Corrigir a verificação usada para editar a matriz.
   - Permitir que `coordenador_geral` altere permissões mesmo quando o papel estiver vinculado ao projeto ativo ou como papel global.
   - Considerar somente papéis ativos.

3. **Bloquear abas por perfil de forma consistente**
   - Remover o fallback amplo que libera abas pela matriz fixa quando a tabela existe mas a consulta falha.
   - Fazer sidebar e guarda de rotas esperarem o carregamento de papéis/permissões antes de decidir o acesso.
   - Se a permissão não carregar, falhar fechado para módulos restritos em vez de mostrar todas as abas.

4. **Alinhar módulos duplicados/antigos na matriz**
   - Limpar ou normalizar módulos que aparecem com nomes antigos ou duplicados, como `dashboard`, `base_conhecimento`, `configuracoes-geral`, `configuracoes-ia`, `usuarios`, `ia_config`.
   - Manter apenas os módulos que realmente existem no menu e nas rotas atuais.

5. **Validar o comportamento final**
   - Coordenação Geral: vê Configurações e consegue editar a matriz.
   - Professor(a): vê apenas Pedagógico, Fiscalização MTE, Relação de Horas e Ajuda, conforme a matriz.
   - Gestão Financeira: vê apenas áreas financeiras/relatórios permitidos.
   - Usuários sem papel ativo: não recebem acesso geral.

## Detalhes técnicos

- Ajustar `usePermissoes`, `rbac.functions`, `use-active-context`, `auth-guard` e o layout autenticado para usar a matriz real como fonte principal.
- Aplicar uma migração idempotente para corrigir dados antigos da tabela de permissões e permissões de escrita/leitura necessárias.
- Não alterar autenticação nem criar novos papéis; apenas corrigir a aplicação dos papéis existentes.