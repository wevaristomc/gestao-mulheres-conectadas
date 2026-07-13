REVOKE ALL ON FUNCTION public.has_role_any(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role_any(uuid, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.has_role_any(uuid, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_any(uuid, text[]) TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.is_project_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_project_admin(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_project_admin(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_admin(uuid, uuid) TO service_role;
