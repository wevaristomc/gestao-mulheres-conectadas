## Diagnóstico

Ao clicar em "Emitir certificado" (`/administrativo/qualificacao`), o fluxo em `src/lib/administrativo-queries.ts` gera o PDF com jsPDF e faz upload em `supabase.storage.from("documentos")` (constante `BUCKET` em `src/lib/base-conhecimento-queries.ts`). O bucket **`documentos` não existe** no projeto — por isso o upload falha com "Bucket not found", a mutation cai em `onError` e nada é persistido nem gerado para o usuário.

O mesmo bucket é usado pela Base de Conhecimento (`uploadDocumentoFile`), então o upload de qualquer documento também está quebrado hoje.

## Correção

**Uma migration** para criar o bucket privado `documentos` com policies em `storage.objects` alinhadas ao restante do app (RLS baseado em `auth.uid()`, acesso apenas para usuários autenticados — os arquivos são consumidos via `createSignedUrl`, que já é o padrão do código).

```sql
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Leitura: qualquer usuário autenticado (signed URLs são geradas server-side pelo client autenticado)
create policy "documentos_select_auth"
on storage.objects for select to authenticated
using (bucket_id = 'documentos');

-- Upload / update / delete: usuários autenticados
create policy "documentos_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'documentos');

create policy "documentos_update_auth"
on storage.objects for update to authenticated
using (bucket_id = 'documentos')
with check (bucket_id = 'documentos');

create policy "documentos_delete_auth"
on storage.objects for delete to authenticated
using (bucket_id = 'documentos');
```

Bucket privado — nada fica público; downloads continuam por `getSignedUrl` / `baixarCertificado`, que já existem.

## Escopo

- **Fora do escopo**: mudar o layout do PDF do certificado, mudar caminho de armazenamento, adicionar controle por papel no acesso ao arquivo (o RLS de `qualificados` já limita quem enxerga o registro), refatorar `emitirCertificado`.
- Nenhuma alteração de código de aplicação — apenas a migration para criar o bucket e policies.

## Arquivos afetados

- Nova migration em `supabase/migrations/` criando o bucket `documentos` + policies acima.