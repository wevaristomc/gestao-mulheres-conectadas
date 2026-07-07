## Objetivo

Fazer as ~30 server functions autenticadas voltarem a funcionar sem migrar nada para o client. O problema é que o `requireSupabaseAuth` lê `process.env.SUPABASE_URL`, que o Lovable Cloud injeta apontando para o projeto gerenciado errado (`ahgcdtnpdfkcrjkxclhb`), então o `auth.getUser(token)` valida o bearer contra o projeto errado e retorna 401.

## Mudança

Um único arquivo: `src/integrations/supabase/auth-middleware.ts`.

Inverter a prioridade das constantes: valores hardcoded do projeto correto primeiro, `process.env` como último fallback.

```ts
// antes
const url = process.env.SUPABASE_URL ?? "https://yqvocpnvunaprpmhlswn.supabase.co";
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

// depois
const CORRECT_URL = "https://yqvocpnvunaprpmhlswn.supabase.co";
const CORRECT_KEY = "eyJhbGciOi...L8FQRfI2M7RAGdTPsyNvHWXEWqmywtfHKP-65eyljwE"; // anon do projeto correto
const url = CORRECT_URL;
const key = CORRECT_KEY;
```

A anon key é pública (JWT `role: anon`), então commitá-la no arquivo não é vazamento — é o mesmo valor já exposto no `.env` VITE_*.

## Consequência

- Todas as server functions com `requireSupabaseAuth` (IA, MTE, editais, gdrive, users) passam a validar o token contra o projeto correto.
- O `context.supabase` dentro dos handlers também passa a apontar para o projeto correto → queries com RLS rodam contra o banco certo.
- Nada quebra do lado do client: continua usando o mesmo `attachSupabaseAuth` para anexar o bearer.

## Aviso

O arquivo `auth-middleware.ts` é marcado "auto-gen — não editar" na doc do Lovable. Se a integração oficial do Supabase for reativada no futuro, o Lovable pode regerar o arquivo e desfazer essa edição. Nesse momento, o `process.env.SUPABASE_URL` gerenciado provavelmente já apontará para o projeto certo, então o problema deixa de existir. Aceitável como workaround.

## Fora de escopo

- Não mexer no `client.ts`, `client.server.ts`, `types.ts`.
- Não migrar server functions para o client.
- Não tocar em `functionMiddleware` no `src/start.ts`.
- Não tocar em segredos do backend (o `ADMIN_SERVICE_ROLE_KEY` continua sendo o do projeto gerenciado — funções que dependem dele, como `criarUsuario`/`resetarSenha`, vão continuar quebrando; isso é assunto separado).
