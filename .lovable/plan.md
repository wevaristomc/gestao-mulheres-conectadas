## Problema

O limite de 30 MB não é do Supabase Storage (que aceita arquivos grandes) — é do **worker que processa o zip no servidor**. O fluxo atual é:

1. Browser sobe o `.zip` inteiro para o bucket `whatsapp`.
2. Server function `processarZip` **baixa o zip inteiro** para dentro do Cloudflare Worker.
3. Faz `JSZip.loadAsync(buf)` em memória.
4. Percorre mensagens, sobe cada mídia individualmente de volta pro Storage, insere linhas.

O Worker tem ~128 MB de RAM por request e um teto de CPU. Um zip de 500 MB (com mídias descompactadas) estoura memória e/ou tempo. Aumentar só o texto "até ~30 MB" na UI não resolve — vai continuar quebrando no server.

## Solução: mover o descompacte para o navegador

O browser aguenta tranquilamente zips de 500 MB+ com `JSZip` (streaming por entry, sem carregar tudo de uma vez em memória contígua). O servidor passa a receber apenas:
- mensagens já parseadas (JSON pequeno),
- mídias já upadas direto do browser para o Storage (com signed upload URLs ou upload autenticado normal — o cliente Supabase suporta).

Isso remove o gargalo do Worker completamente. Limite prático passa a ser o do bucket (padrão 50 MB por objeto individual, ajustável — mídias do WhatsApp raramente passam disso; o zip agregando 500 MB é composto de arquivos pequenos).

## Passos

**1. Novo módulo `src/lib/whatsapp-zip-client.ts`** (client-only)
- Recebe o `File` do input.
- `JSZip.loadAsync(file)` — JSZip lê `File`/`Blob` em modo streaming, não carrega tudo na RAM.
- Localiza `_chat.txt`, chama `parseChat` (o parser já é isomórfico, pode rodar no browser).
- Para cada mídia referenciada nas mensagens: `entry.async("blob")` e `supabase.storage.from("whatsapp").upload(...)` com `upsert: true`. Progresso reportado via callback.
- Opcional: sobe o `.zip` original em background para `imports/{id}/original.zip` (política "armazenar cru") — sem bloquear o processamento.
- Retorna `{ importacaoTempId, mensagensParseadas, midiasUpadas, periodo }`.

**2. Nova server fn `registrarImportacao`** em `src/lib/whatsapp.functions.ts`
- Substitui a lógica pesada de `processarZip`.
- Recebe: `grupo_id`, `arquivo_nome`, `zip_path` (o zip cru, opcional), `periodo_inicio/fim`, contadores, e o array de mensagens já com `midia_path` preenchido pelo cliente.
- Cria linha em `wa_importacoes`, insere mensagens em chunks de 500 (lógica atual das linhas 151–160), atualiza contadores. Nada de JSZip, nada de download de zip.
- Mantém `processarZip` antigo por retrocompatibilidade em zips pequenos? **Não** — remove, o cliente sempre processa.

**3. UI em `src/routes/_authenticated/whatsapp.index.tsx`**
- Trocar texto "até ~30 MB" por "até ~500 MB (o processamento acontece no seu navegador)".
- Reescrever `importMut.mutationFn`:
  - chamar `processarZipNoBrowser(file, { onProgress })`,
  - mostrar barra de progresso (mídias upadas / total, + estado atual: "lendo zip", "upando mídias X/Y", "salvando mensagens"),
  - chamar `registrarImportacao` no final.
- Aumentar `accept` no input mantido; sem limite artificial de tamanho no client (browser lida).

**4. Ajustes menores**
- `input type="file"` não tem limite intrínseco; só reforçar aviso visual.
- Confirmar que o bucket `whatsapp` no Supabase não tem `file_size_limit` restritivo (padrão do projeto é 50 MB por objeto — suficiente para mídias individuais do WhatsApp; se algum vídeo exceder, avisa e pula, sem quebrar a importação).

## Riscos / notas

- **Zip original de 500 MB**: subir o `.zip` cru como um único objeto pode bater no `file_size_limit` do bucket. Duas opções: (a) subir o cru só se ≤50 MB; (b) desabilitar upload do cru para zips grandes e avisar o usuário — o dado "cru" fica preservado nas mídias individuais + `_chat.txt` (que a gente pode salvar como objeto separado). Vou por **(b)** para não exigir mudança de política do bucket.
- **Aba fechada durante o upload**: já era problema antes com uploads grandes. Aviso "não feche a aba" na UI.
- **Progresso**: o `supabase.storage.upload` não expõe progresso por byte, mas por-arquivo já é suficiente ("312 / 940 mídias").

## Arquivos tocados

- criar `src/lib/whatsapp-zip-client.ts`
- editar `src/lib/whatsapp.functions.ts` (adicionar `registrarImportacao`, remover/limpar `processarZip`)
- editar `src/routes/_authenticated/whatsapp.index.tsx` (novo fluxo + progresso + texto)

1 build ao final. Sem SQL novo.