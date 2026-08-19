GRANT SELECT ON public.installment_fees TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installment_fees TO authenticated;
GRANT ALL ON public.installment_fees TO service_role;