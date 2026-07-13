DROP POLICY IF EXISTS "projetos_no_direct_update" ON public.projetos;
DROP POLICY IF EXISTS "projetos_no_direct_insert" ON public.projetos;
DROP POLICY IF EXISTS "projetos_coord_update" ON public.projetos;
DROP POLICY IF EXISTS "projetos_coord_insert" ON public.projetos;

CREATE POLICY "projetos_coord_update" ON public.projetos
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (ur.projeto_id = projetos.id OR ur.projeto_id IS NULL)
      AND ur.role::text = 'coordenador_geral'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (ur.projeto_id = projetos.id OR ur.projeto_id IS NULL)
      AND ur.role::text = 'coordenador_geral'
  )
);

CREATE POLICY "projetos_coord_insert" ON public.projetos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = 'coordenador_geral'
  )
);