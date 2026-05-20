
ALTER TABLE public.vehicle_question_flow
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_answer text;
