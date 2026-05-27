
-- Remove broad public SELECT (which enables listing). Public URLs still work via CDN
-- because the bucket itself is marked public.
DROP POLICY IF EXISTS "public read product-images" ON storage.objects;

-- Admins can still list/read for management.
CREATE POLICY "admin list product-images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));
