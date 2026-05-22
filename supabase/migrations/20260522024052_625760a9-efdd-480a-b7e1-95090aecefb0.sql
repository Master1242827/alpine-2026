
-- 1) store_settings: restrict direct table reads to admins; expose safe fields via view
DROP POLICY IF EXISTS "public read store_settings" ON public.store_settings;

CREATE POLICY "admin read store_settings"
ON public.store_settings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.store_settings_public
WITH (security_invoker = on) AS
SELECT
  id,
  store_name,
  whatsapp_number,
  pix_enabled,
  pix_discount_percent,
  pix_message
FROM public.store_settings;

GRANT SELECT ON public.store_settings_public TO anon, authenticated;

-- The view relies on the base table's RLS (security_invoker). Allow anon/auth
-- to read through the view by adding a narrowly scoped policy that only the
-- view's exposed columns can satisfy. Since RLS is row-level (not column-level),
-- we permit public SELECT on the base table BUT only via the view by using a
-- separate policy granting row visibility - simplest: re-add a public read
-- policy that still permits SELECT, and rely on the view to limit columns at
-- the application layer. Sensitive data is excluded from the view.
-- To prevent direct table access to sensitive columns, revoke column SELECTs:
REVOKE SELECT ON public.store_settings FROM anon, authenticated;
GRANT SELECT (id, store_name, whatsapp_number, pix_enabled, pix_discount_percent, pix_message)
  ON public.store_settings TO anon, authenticated;

-- Re-add a row-visibility policy so the granted columns are actually readable
CREATE POLICY "public read safe store_settings columns"
ON public.store_settings FOR SELECT
USING (true);

-- 2) orders: only signed-in users may insert, and only for themselves
DROP POLICY IF EXISTS "anyone insert orders" ON public.orders;
CREATE POLICY "users insert own orders"
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3) order_items: must belong to an order owned by the inserter
DROP POLICY IF EXISTS "anyone insert order_items" ON public.order_items;
CREATE POLICY "users insert items for own orders"
ON public.order_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = auth.uid()
  )
);

-- 4) storage: drop overly broad public listing policy on product-images
DROP POLICY IF EXISTS "public select product images" ON storage.objects;

-- 5) has_role: revoke direct EXECUTE; RLS evaluation still works (system call)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
