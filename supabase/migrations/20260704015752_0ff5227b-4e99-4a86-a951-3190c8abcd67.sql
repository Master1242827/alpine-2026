CREATE OR REPLACE FUNCTION public.get_public_pix_settings()
RETURNS TABLE(pix_enabled boolean, pix_discount_percent numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(pix_enabled, false), COALESCE(pix_discount_percent, 0)
  FROM public.store_settings WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pix_settings() TO anon, authenticated;