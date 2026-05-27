-- Allow the non-privileged public.has_role function to run safely for anonymous
-- catalog reads. RLS still blocks anonymous users from seeing any role rows.
GRANT SELECT ON public.user_roles TO anon;