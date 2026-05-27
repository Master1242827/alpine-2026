-- Restore safe RLS role checks for authenticated users/admin panel.
-- The function is intentionally executable because RLS policies call it as the
-- API caller. It only evaluates the current user's own role, preventing users
-- from probing roles for arbitrary accounts via RPC.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Explicit Data API permissions. RLS policies remain the source of truth for
-- who can see or modify rows.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.vehicle_makes TO anon, authenticated;
GRANT SELECT ON public.vehicle_models TO anon, authenticated;
GRANT SELECT ON public.cabin_types TO anon, authenticated;
GRANT SELECT ON public.vehicle_product_map TO anon, authenticated;
GRANT SELECT ON public.configurator_questions TO anon, authenticated;
GRANT SELECT ON public.configurator_options TO anon, authenticated;
GRANT SELECT ON public.vehicle_question_flow TO anon, authenticated;
GRANT SELECT ON public.store_settings_public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_makes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_models TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabin_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_product_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configurator_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configurator_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_question_flow TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, UPDATE ON public.store_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admin_integrations TO authenticated;
GRANT SELECT ON public.mp_webhook_events TO authenticated;

GRANT ALL ON public.admin_integrations TO service_role;
GRANT ALL ON public.cabin_types TO service_role;
GRANT ALL ON public.categories TO service_role;
GRANT ALL ON public.configurator_options TO service_role;
GRANT ALL ON public.configurator_questions TO service_role;
GRANT ALL ON public.mp_webhook_events TO service_role;
GRANT ALL ON public.order_items TO service_role;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.store_settings TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.vehicle_makes TO service_role;
GRANT ALL ON public.vehicle_models TO service_role;
GRANT ALL ON public.vehicle_product_map TO service_role;
GRANT ALL ON public.vehicle_question_flow TO service_role;

-- Keep direct sensitive settings private for anonymous visitors.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.store_settings FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.admin_integrations FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.orders FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.order_items FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.profiles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_roles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.mp_webhook_events FROM anon;

-- Clean up conflicting/duplicate product image policies and recreate the safe
-- admin-only Storage API access. The bucket remains public for serving image URLs,
-- but anonymous users cannot list objects through the API.
DROP POLICY IF EXISTS "anyone download product images" ON storage.objects;
DROP POLICY IF EXISTS "public read product images" ON storage.objects;
DROP POLICY IF EXISTS "public read product-images" ON storage.objects;
DROP POLICY IF EXISTS "public select product images" ON storage.objects;
DROP POLICY IF EXISTS "admin list product-images" ON storage.objects;
DROP POLICY IF EXISTS "admin select product-images" ON storage.objects;
DROP POLICY IF EXISTS "admin upload product images" ON storage.objects;
DROP POLICY IF EXISTS "admin write product-images" ON storage.objects;
DROP POLICY IF EXISTS "admin insert product-images" ON storage.objects;
DROP POLICY IF EXISTS "admin update product images" ON storage.objects;
DROP POLICY IF EXISTS "admin update product-images" ON storage.objects;
DROP POLICY IF EXISTS "admin delete product images" ON storage.objects;
DROP POLICY IF EXISTS "admin delete product-images" ON storage.objects;

CREATE POLICY "admin select product-images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin insert product-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin update product-images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin delete product-images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

UPDATE storage.buckets
SET public = true
WHERE id = 'product-images';