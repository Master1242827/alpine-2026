ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'processing' AFTER 'paid';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_label_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_label_id text;