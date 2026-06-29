## Objetivo

Habilitar (1) bootstrap do seu usuário admin via tela de cadastro pública e (2) área para o admin cadastrar novos usuários com senha provisória, com papéis por projeto.

## 1. Bootstrap do primeiro admin

- Adicionar aba "Criar conta" na tela `/auth` (e-mail + senha + nome). Usa `supabase.auth.signUp` com `emailRedirectTo`.
- SQL a rodar no Supabase (você executa no SQL Editor):
  - Trigger `on_auth_user_created` que, ao inserir em `auth.users`, verifica se ainda não existe nenhum registro em `user_roles` para o `projeto_id` ativo (projeto único atual `yqvocpnvunaprpmhlswn`); se for o primeiro usuário do projeto, insere `role='coordenador_geral'` automaticamente.
  - Para os próximos usuários, o trigger não atribui papel — eles ficam "sem papel" até o admin atribuir.
- Após o cadastro do primeiro usuário, **desabilitar sign-up público**: a aba "Criar conta" some quando já existe pelo menos 1 `coordenador_geral` no projeto (checagem via RPC pública `tem_admin(projeto_id)`).

## 2. Tela "Configurações › Usuários"

Rota: `/_authenticated/configuracoes/usuarios` (visível só para `coordenador_geral`).

Funcionalidades:
- **Lista de usuários** do projeto ativo: e-mail, nome, papel, último acesso, status.
- **Criar usuário** (modal): e-mail, nome, papel (select com os 6 papéis), senha provisória (gerada/copiável).
  - Chama server function `criarUsuario` (`createServerFn` + `requireSupabaseAuth` + checagem `has_role('coordenador_geral')`) que:
    1. Usa `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome, must_change_password: true } })`.
    2. Insere em `user_roles` (`user_id`, `projeto_id`, `role`).
- **Editar papel** do usuário no projeto ativo.
- **Remover acesso**: deleta linha de `user_roles` do projeto (não apaga o auth user).
- **Reenviar senha provisória**: gera nova senha via `supabaseAdmin.auth.admin.updateUserById`.

## 3. Troca obrigatória no primeiro login

- Hook no `ActiveContextProvider`: se `user.user_metadata.must_change_password === true`, redireciona para `/trocar-senha` antes de qualquer outra rota.
- Tela `/trocar-senha`: form nova senha → `supabase.auth.updateUser({ password, data: { must_change_password: false } })` → redireciona para `/`.

## 4. Detalhes técnicos

**Arquivos novos:**
- `src/lib/users.functions.ts` — `criarUsuario`, `atualizarPapel`, `removerAcesso`, `resetarSenha`, `listarUsuariosProjeto` (server fns com `requireSupabaseAuth` + checagem de papel).
- `src/integrations/supabase/client.server.ts` — cliente service role (lazy import dentro dos handlers).
- `src/routes/_authenticated/configuracoes/usuarios.tsx` — tela CRUD.
- `src/routes/_authenticated/trocar-senha.tsx` — troca de senha obrigatória.
- `src/components/users/criar-usuario-dialog.tsx`, `editar-papel-dialog.tsx`.

**Arquivos modificados:**
- `src/routes/auth.tsx` — adicionar Tabs Login | Criar conta (com gate via `tem_admin`).
- `src/hooks/use-active-context.tsx` — checar `must_change_password` e bloquear navegação.
- `src/components/app-sidebar.tsx` — sub-item "Usuários" em Configurações (só `coordenador_geral`).
- `.env` — adicionar `SUPABASE_SERVICE_ROLE_KEY` (você cola).

**SQL que você roda no Supabase:**
```sql
-- função pública para checar se projeto já tem admin
create or replace function public.tem_admin(_projeto_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles
    where projeto_id = _projeto_id and role = 'coordenador_geral')
$$;
grant execute on function public.tem_admin(uuid) to anon, authenticated;

-- trigger: 1º usuário do projeto vira coordenador_geral
create or replace function public.handle_first_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare _projeto_id uuid := 'yqvocpnvunaprpmhlswn'::uuid; -- ajustar para o id real
begin
  if not public.tem_admin(_projeto_id) then
    insert into public.user_roles(user_id, projeto_id, role)
    values (new.id, _projeto_id, 'coordenador_geral');
  end if;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_first_user();

-- policies: coordenador_geral gerencia user_roles do projeto
create policy ur_cg_manage on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'coordenador_geral'))
  with check (public.has_role(auth.uid(), 'coordenador_geral'));
```

**Segredos necessários:** `SUPABASE_SERVICE_ROLE_KEY` (você fornece via secrets — nunca vai pro front).

## Sequência de entrega

1. Crio arquivos + SQL (te entrego o bloco).
2. Você roda o SQL e me dá o service role key.
3. Você acessa `/auth` → "Criar conta" → vira admin automaticamente.
4. Vai em Configurações › Usuários e cadastra a equipe.