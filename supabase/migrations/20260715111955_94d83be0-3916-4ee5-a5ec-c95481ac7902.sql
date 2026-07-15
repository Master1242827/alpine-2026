
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_cpf TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_file_url TEXT;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS card_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installments_max INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS installments_interest_free INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installments_monthly_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_public_payment_settings()
RETURNS TABLE(
  pix_enabled BOOLEAN,
  pix_discount_percent NUMERIC,
  card_discount_percent NUMERIC,
  installments_max INTEGER,
  installments_interest_free INTEGER,
  installments_monthly_rate NUMERIC
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(pix_enabled, false),
    COALESCE(pix_discount_percent, 0),
    COALESCE(card_discount_percent, 0),
    COALESCE(installments_max, 10),
    COALESCE(installments_interest_free, 1),
    COALESCE(installments_monthly_rate, 0)
  FROM public.store_settings WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_settings() TO anon, authenticated;
