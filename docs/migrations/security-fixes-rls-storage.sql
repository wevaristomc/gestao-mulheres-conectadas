-- Security fixes: tighten RLS on importacoes_presenca and storage.objects
-- for the "documentos" bucket. Idempotente. Aditivo.
--
-- Motivação (scanner de segurança):
--  1. importacoes_presenca: política ALL com USING/WITH CHECK = true permitia
--     qualquer usuário autenticado ler/alterar/excluir importações de qualquer
--     turma. Substituída por checagem de papel (has_role) igual ao restante do
--     módulo pedagógico.
--  2. Bucket 'documentos' (privado): as policies só verificavam bucket_id, sem
--     checagem de dono. Passamos a exigir auth.uid() = owner para UPDATE/DELETE
--     (ou papel de coordenação/administrativo). SELECT permanece aberto a
--     autenticados por ser um acervo compartilhado do projeto, mas garantimos
--     que mutações só possam ser feitas por quem enviou ou pela coordenação.

-- =========================================================================
-- 1) public.importacoes_presenca — remover política permissiva "USING (true)"
-- =========================================================================

ALTER TABLE public.importacoes_presenca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth users manage importacoes_presenca" ON public.importacoes_presenca;
DROP POLICY IF EXISTS "importacoes_presenca_all_staff" ON public.importacoes_presenca;

CREATE POLICY "importacoes_presenca_all_staff"
  ON public.importacoes_presenca
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_geral'::app_role)
    OR public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_pedagogico'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador_geral'::app_role)
    OR public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_pedagogico'::app_role)
  );

-- =========================================================================
-- 2) storage.objects — bucket 'documentos': exigir dono para UPDATE/DELETE
-- =========================================================================

DROP POLICY IF EXISTS documentos_select_auth  ON storage.objects;
DROP POLICY IF EXISTS documentos_insert_auth  ON storage.objects;
DROP POLICY IF EXISTS documentos_update_auth  ON storage.objects;
DROP POLICY IF EXISTS documentos_delete_auth  ON storage.objects;

-- SELECT: acervo compartilhado do projeto — qualquer autenticado lê.
CREATE POLICY documentos_select_auth
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'documentos');

-- INSERT: qualquer autenticado pode subir; owner é preenchido automaticamente
-- pelo storage a partir de auth.uid(), o que amarra o objeto ao autor.
CREATE POLICY documentos_insert_auth
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documentos');

-- UPDATE: apenas o dono do objeto, ou papéis de coordenação/administrativo.
CREATE POLICY documentos_update_owner_or_staff
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'coordenador_geral'::app_role)
      OR public.has_role(auth.uid(), 'administrativo'::app_role)
      OR public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'coordenador_geral'::app_role)
      OR public.has_role(auth.uid(), 'administrativo'::app_role)
      OR public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
    )
  );

-- DELETE: idem UPDATE — só dono ou coordenação/administrativo.
CREATE POLICY documentos_delete_owner_or_staff
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'coordenador_geral'::app_role)
      OR public.has_role(auth.uid(), 'administrativo'::app_role)
      OR public.has_role(auth.uid(), 'coordenador_pedagogico'::app_role)
    )
  );

-- Observação: operações server-side usam service_role (bypassa RLS), então as
-- rotinas de ingestão (Drive sync, WhatsApp, base de conhecimento) continuam
-- funcionando normalmente.