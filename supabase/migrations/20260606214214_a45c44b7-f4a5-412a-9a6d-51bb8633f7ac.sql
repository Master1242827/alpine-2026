ALTER TABLE public.admin_integrations
  ADD COLUMN IF NOT EXISTS frenet_token text;