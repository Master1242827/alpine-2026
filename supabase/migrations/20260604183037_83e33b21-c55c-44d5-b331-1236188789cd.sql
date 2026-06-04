ALTER TABLE public.configurator_questions ADD COLUMN model_id UUID REFERENCES public.vehicle_models(id) ON DELETE SET NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configurator_questions TO authenticated;
GRANT ALL ON public.configurator_questions TO service_role;