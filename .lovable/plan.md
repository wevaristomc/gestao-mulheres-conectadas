## Objetivo

Facilitar o bootstrap do primeiro admin exibindo, na própria tela `/auth`, o SQL necessário para criar `public.tem_admin` e o trigger `on_auth_user_created_first_admin`, junto com instruções de teste no Supabase.

## Onde aparece

Na `src/routes/auth.tsx`, abaixo do `CardHeader` (ou como link discreto no rodapé do card), um botão secundário:

> **"Primeiro acesso? Ver SQL de setup"**

Sempre visível (útil para debug), mas com destaque maior quando `temAdmin === false` — sinal de que o projeto ainda precisa do bootstrap.

## O que o modal mostra

Um `Dialog` (shadcn) com:

1. **Passo 1 — Rode este SQL no Supabase**
   Bloco de código com botão "Copiar" contendo:

   ```sql
   -- 1) Função pública para checar se o projeto já tem admin
   create or replace function public.tem_admin(_projeto_id uuid)
   returns boolean
   language sql stable security definer set search_path = public as $$
     select exists (
       select 1 from public.user_roles
       where projeto_id = _projeto_id and role = 'coordenador_geral'
     )
   $$;
   grant execute on function public.tem_admin(uuid) to anon, authenticated;

   -- 2) Trigger: 1º usuário do projeto vira coordenador_geral automaticamente
   create or replace function public.handle_first_user()
   returns trigger language plpgsql security definer set search_path = public as $$
   declare _projeto_id uuid := 'd91d2e5a-3d0b-4539-915c-5db6c95dd302'::uuid;
   begin
     if not public.tem_admin(_projeto_id) then
       insert into public.user_roles(user_id, projeto_id, role)
       values (new.id, _projeto_id, 'coordenador_geral');
     end if;
     return new;
   end $$;

   drop trigger if exists on_auth_user_created_first_admin on auth.users;
   create trigger on_auth_user_created_first_admin
     after insert on auth.users
     for each row execute function public.handle_first_user();
   ```

2. **Passo 2 — Como executar**
   Lista curta:
   - Abra o painel do Supabase → **SQL Editor** → **New query**.
   - Cole o SQL acima e clique em **Run**.
   - Espere ver "Success. No rows returned".

3. **Passo 3 — Testar**
   - Volte para esta tela e recarregue: a aba **"Criar conta admin"** deve aparecer.
   - Cadastre nome + e-mail + senha (mín. 8). Você é logado direto e recebe `coordenador_geral`.
   - Verifique no Supabase: `select * from public.user_roles;` deve mostrar sua linha.
   - A aba "Criar conta admin" some depois — novos usuários passam a ser criados em **Configurações › Usuários**.

4. **Passo 4 (opcional) — Habilitar gestão de usuários**
   Nota curta: "Para criar outros usuários pela tela Configurações › Usuários, também configure o secret `ADMIN_SERVICE_ROLE_KEY` no painel."

## Detalhes técnicos

**Arquivos modificados:**
- `src/routes/auth.tsx` — adicionar estado `sqlOpen`, botão que abre o `Dialog`, e o conteúdo do modal. Um pequeno componente `SqlSetupDialog` no mesmo arquivo (não vale extrair).
- Reutilizar `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` de `@/components/ui/dialog` e `Button` de `@/components/ui/button`.

**Cópia para clipboard:**
- Botão "Copiar SQL" usa `navigator.clipboard.writeText(sql)` e mostra "Copiado!" por 2s via `useState`. Sem dependência nova.

**Estilo:**
- SQL num `<pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">` para não estourar o modal.
- Modal com `max-w-2xl` para caber o SQL confortavelmente.

**Não muda nada de backend/lógica** — é puramente informacional/UX. Nenhum arquivo novo, nenhum SQL rodando pelo app.

## Fora de escopo

- Rodar o SQL automaticamente a partir do app.
- Detectar se o trigger já existe (isso continua implícito pelo comportamento do `tem_admin`).
