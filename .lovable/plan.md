## Causa

A coluna `user_roles.role` no seu Supabase é `text` (não `app_role`), então a comparação `role = _role` falha com `operator does not exist: text = app_role`.

## Correção

Ajustar `public.has_role()` para fazer cast `_role::text`, mantendo a assinatura com enum (compatível com a arquitetura). Reaplicar o bloco de policies de `user_roles` e `cursistas` sem alterações.

```sql
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role = _role::text
  )
$$;
```

Rode apenas esse `CREATE OR REPLACE FUNCTION` (as policies criadas antes já chamam `has_role` e voltam a funcionar). Depois eu rerodo os counts de `projetos`, `turmas`, `cursistas`, `pendencias` para confirmar.

> Alternativa (não recomendada agora): migrar a coluna `user_roles.role` de `text` para `app_role` via `ALTER TABLE ... USING role::app_role`. Pode quebrar dados existentes se houver valores fora do enum — fica para depois.
