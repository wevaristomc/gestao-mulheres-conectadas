create policy "documentos_select_auth"
on storage.objects for select to authenticated
using (bucket_id = 'documentos');

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