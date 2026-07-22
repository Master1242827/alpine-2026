
-- Ponto 5: vídeo nas observações do pedido
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes_video_url text;

-- Ponto 6: taxas de parcelamento personalizadas por número de parcelas
CREATE TABLE IF NOT EXISTS public.installment_fees (
  installments int PRIMARY KEY CHECK (installments >= 1 AND installments <= 24),
  fee_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent <= 100),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.installment_fees TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installment_fees TO authenticated;
GRANT ALL ON public.installment_fees TO service_role;

ALTER TABLE public.installment_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read installment fees" ON public.installment_fees;
CREATE POLICY "public read installment fees" ON public.installment_fees
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin manage installment fees" ON public.installment_fees;
CREATE POLICY "admin manage installment fees" ON public.installment_fees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default: 1x a 12x com 0% (você define depois)
INSERT INTO public.installment_fees (installments, fee_percent, active)
SELECT g, 0, true FROM generate_series(1, 12) AS g
ON CONFLICT (installments) DO NOTHING;
