ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.has_role_any(_user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = ANY(_roles)
      AND COALESCE(ativo, true) = true
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role::text
      AND COALESCE(ativo, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_admin(_user_id uuid, _projeto_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (projeto_id = _projeto_id OR projeto_id IS NULL)
      AND role::text IN ('coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico')
      AND COALESCE(ativo, true) = true
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role_any(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_admin(uuid, uuid) TO authenticated;
