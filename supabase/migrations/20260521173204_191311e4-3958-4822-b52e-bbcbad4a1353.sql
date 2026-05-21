ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS allowed_carriers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_carriers text[] NOT NULL DEFAULT '{}';