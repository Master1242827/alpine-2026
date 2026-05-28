
ALTER TABLE public.configurator_questions
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Inicializa a ordem com base no rótulo atual para perguntas já existentes
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY label) - 1 AS rn
  FROM public.configurator_questions
)
UPDATE public.configurator_questions q
SET display_order = ordered.rn
FROM ordered
WHERE q.id = ordered.id AND q.display_order = 0;

ALTER TABLE public.products
  ALTER COLUMN requires_vehicle_config SET DEFAULT true;
