## Objetivo
Fazer com que, ao clicar em **Usar arquivos**, a importação do Google Drive finalize de forma visível: registre os documentos na Base de Conhecimento, feche o seletor quando houver sucesso e mostre erro claro quando algo falhar.

## Diagnóstico provável
Pelos registros de rede, o download/importação para o armazenamento está retornando sucesso. O ponto frágil está depois disso: o app tenta inserir o registro em `documentos` pelo cliente. Se esse insert falhar por permissão/RLS/schema, a falha fica agrupada como “0 importado(s), X com falha”, sem detalhe suficiente, e o usuário percebe como se nada tivesse acontecido.

## Plano de correção
1. **Centralizar a importação no servidor**
   - Ajustar `importGdriveToBucket` para também criar o registro em `documentos` no mesmo fluxo em que baixa o arquivo do Drive e salva no armazenamento.
   - Enviar para essa função: `projetoId`, `categoria` e dados mínimos do arquivo.
   - Retornar um DTO simples com o documento criado e os dados do arquivo.

2. **Evitar insert duplicado no cliente**
   - Remover da tela `base-conhecimento` o insert manual em `documentos` após o upload.
   - O cliente passará apenas a chamar a função de importação e atualizar o progresso.

3. **Melhorar mensagens de erro**
   - Mostrar no toast os nomes dos arquivos que falharam e o primeiro motivo real da falha.
   - Manter o seletor aberto quando todos falharem, para a pessoa poder tentar novamente.
   - Fechar o seletor quando pelo menos um arquivo for importado com sucesso.

4. **Limpeza e consistência da lista**
   - Invalidar a query da Base de Conhecimento após importar para os novos documentos aparecerem imediatamente.
   - Confirmar que `importProgress` volta ao estado normal no fim, mesmo com erro parcial.

## Validação
- Reproduzir o fluxo: abrir Base de Conhecimento, selecionar arquivo(s) do Drive e clicar em **Usar arquivos**.
- Confirmar que aparece toast de sucesso/erro detalhado e que a tabela mostra os documentos importados sem recarregar a página.