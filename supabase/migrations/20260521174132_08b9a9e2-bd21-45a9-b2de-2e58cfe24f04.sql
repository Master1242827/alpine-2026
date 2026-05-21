ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shipping_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS shipping_length_cm integer,
  ADD COLUMN IF NOT EXISTS shipping_width_cm  integer,
  ADD COLUMN IF NOT EXISTS shipping_height_cm integer;