
-- Lock down user_roles: prevent any non-admin from inserting/updating/deleting role rows.
-- The existing "admin write user_roles" PERMISSIVE ALL policy stays, but we add a
-- RESTRICTIVE policy that ANDs with it, blocking writes by non-admins entirely.

-- Drop & recreate as RESTRICTIVE so the check is mandatory.
DROP POLICY IF EXISTS "only admins can write user_roles" ON public.user_roles;

CREATE POLICY "only admins can write user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Ensure RLS is on (defensive — already enabled)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
