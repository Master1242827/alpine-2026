
-- Add terminates_flow flag to configurator options (lets a specific answer end the configurator early)
ALTER TABLE public.configurator_options
  ADD COLUMN IF NOT EXISTS terminates_flow boolean NOT NULL DEFAULT false;

-- Public RPC to read the store WhatsApp number (store_settings is admin-only via RLS)
CREATE OR REPLACE FUNCTION public.get_whatsapp_number()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT whatsapp_number FROM public.store_settings WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_number() TO anon, authenticated;
