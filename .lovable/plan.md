## Plano

1. **Corrigir o upload manual de documentos**
   - Parar de registrar o documento diretamente pelo cliente depois do upload.
   - Criar/usar um fluxo de servidor autenticado para salvar o arquivo e registrar o item na tabela `documentos`, igual ao padrão já aplicado na importação pelo Drive.
   - Manter rollback: se o registro falhar, remover o arquivo enviado para não deixar arquivo órfão.
   - Exibir a mensagem real do erro no diálogo/toast caso algo ainda falhe.

2. **Ajustar compatibilidade com o schema atual**
   - Reaproveitar a lógica adaptativa de inserção para lidar com campos que existem/não existem (`tipo`, `autor_id`, `storage_path`, etc.).
   - Evitar novas tentativas inúteis em colunas inexistentes e tratar claramente erro de permissão/RLS quando acontecer.

3. **Corrigir o layout da caixa “Novo documento”**
   - Limitar largura responsiva do diálogo e impedir que inputs/textarea extrapolem para fora.
   - Quebrar/truncar nomes longos de arquivo e títulos longos corretamente.
   - Ajustar rodapé e botões para ficarem alinhados em desktop e empilháveis no mobile.
   - Trocar o texto técnico sobre “bucket privado” por uma descrição mais curta e legível.

4. **Validar o fluxo**
   - Confirmar que: selecionar arquivo → título preenchido → enviar → diálogo fecha → documento aparece na lista.
   - Confirmar visualmente que o diálogo fica centralizado e proporcional com nomes longos como no anexo.