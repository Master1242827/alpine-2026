ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS hero_image_url text;

CREATE OR REPLACE FUNCTION public.get_hero_image_url()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hero_image_url FROM public.store_settings WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_hero_image_url() TO anon, authenticated;