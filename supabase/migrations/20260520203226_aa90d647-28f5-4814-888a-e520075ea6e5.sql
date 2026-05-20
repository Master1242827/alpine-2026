
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS pix_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pix_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pix_key_type text NOT NULL DEFAULT 'cpf',
  ADD COLUMN IF NOT EXISTS pix_holder_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pix_bank text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pix_discount_percent numeric(5,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pix_message text NOT NULL DEFAULT 'Após o pagamento, envie o comprovante para confirmarmos o pedido.',
  ADD COLUMN IF NOT EXISTS pix_qr_image_url text,
  ADD COLUMN IF NOT EXISTS pix_copy_paste text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'mercadopago',
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
