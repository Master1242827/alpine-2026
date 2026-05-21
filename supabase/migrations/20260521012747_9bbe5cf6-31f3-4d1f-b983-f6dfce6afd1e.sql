
ALTER TABLE public.store_settings DROP COLUMN IF EXISTS melhor_envio_token;

CREATE TABLE IF NOT EXISTS public.admin_integrations (
  id integer PRIMARY KEY DEFAULT 1,
  melhor_envio_token text,
  melhor_envio_env text NOT NULL DEFAULT 'production',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_integrations_singleton CHECK (id = 1)
);

INSERT INTO public.admin_integrations (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read admin_integrations" ON public.admin_integrations;
CREATE POLICY "admin read admin_integrations" ON public.admin_integrations
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "admin update admin_integrations" ON public.admin_integrations;
CREATE POLICY "admin update admin_integrations" ON public.admin_integrations
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
