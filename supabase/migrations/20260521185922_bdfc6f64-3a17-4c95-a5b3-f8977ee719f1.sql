
CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null,
  topic text,
  payment_status text,
  mapped_status text,
  order_id uuid,
  raw_body text,
  query_string text,
  processed_at timestamptz not null default now(),
  unique (payment_id, payment_status)
);

CREATE INDEX IF NOT EXISTS mp_webhook_events_payment_id_idx ON public.mp_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS mp_webhook_events_order_id_idx ON public.mp_webhook_events(order_id);

ALTER TABLE public.mp_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read mp_webhook_events" ON public.mp_webhook_events
  FOR SELECT TO public
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
