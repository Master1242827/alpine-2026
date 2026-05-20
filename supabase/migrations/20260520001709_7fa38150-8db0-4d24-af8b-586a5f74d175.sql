
ALTER TABLE public.vehicle_makes ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.vehicle_models ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.vehicle_models ADD COLUMN IF NOT EXISTS year_from integer;
ALTER TABLE public.vehicle_models ADD COLUMN IF NOT EXISTS year_to integer;
ALTER TABLE public.cabin_types ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.vehicle_product_map ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_vpm_lookup ON public.vehicle_product_map (model_id, cabin_type_id);
