
-- 1. Fix SECURITY DEFINER view: switch to security_invoker
ALTER VIEW public.store_settings_public SET (security_invoker = on);

-- 2. Fix storage SELECT policy for product-images (replace fragile condition)
DROP POLICY IF EXISTS "anyone download product images" ON storage.objects;
CREATE POLICY "public read product-images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-images');

-- 3. Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated/public.
-- has_role is used internally by RLS (runs as definer regardless) and should not be callable via RPC.
-- handle_new_user is a trigger function and must not be callable via RPC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Tighten orders: checkout requires authentication, so user_id must not be nullable
ALTER TABLE public.orders ALTER COLUMN user_id SET NOT NULL;
