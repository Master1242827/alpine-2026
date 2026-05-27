-- Replace public.has_role with a non-privileged function so it can be safely
-- executed by RLS policies without exposing a SECURITY DEFINER function.
-- It can only check the role of the currently signed-in user because the
-- user_roles read policy below only exposes the caller's own rows.
DROP POLICY IF EXISTS "admin write user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "only admins can write user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "read own roles or admin" ON public.user_roles;
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;

CREATE POLICY "read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    ),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

-- No client-side policy is created for writing user_roles on purpose.
-- Admin bootstrap/role assignment uses trusted server code with service-role access,
-- while direct browser writes remain denied by RLS.