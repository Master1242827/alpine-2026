
-- Lock down store_settings: only admins read the raw table; safe columns are exposed via the view.
DROP POLICY IF EXISTS "public read safe store_settings columns" ON public.store_settings;
REVOKE SELECT ON public.store_settings FROM anon, authenticated;

-- Make the public view a SECURITY DEFINER view so anon/auth users can read safe columns
-- without needing direct access to the underlying table.
ALTER VIEW public.store_settings_public SET (security_invoker = off);
GRANT SELECT ON public.store_settings_public TO anon, authenticated;
