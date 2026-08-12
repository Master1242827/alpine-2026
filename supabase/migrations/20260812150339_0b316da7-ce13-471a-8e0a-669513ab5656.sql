-- 1. Orders: campos de logística
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS tracking_carrier text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_tracking_code ON public.orders (tracking_code);
CREATE INDEX IF NOT EXISTS idx_orders_status_delivered_at ON public.orders (status, delivered_at);

-- 2. Return requests
CREATE TABLE IF NOT EXISTS public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.return_requests TO authenticated;
GRANT UPDATE, DELETE ON public.return_requests TO authenticated;
GRANT ALL ON public.return_requests TO service_role;

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own return requests or admin"
  ON public.return_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users insert own return requests"
  ON public.return_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()
  ));

CREATE POLICY "admin update return requests"
  ON public.return_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin delete return requests"
  ON public.return_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER return_requests_updated_at
  BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_return_requests_order ON public.return_requests (order_id, status);

-- 3. Order status history
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status order_status NOT NULL,
  source text NOT NULL DEFAULT 'system',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read history of own orders or admin"
  ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history (order_id, created_at DESC);

-- 4. Trigger de histórico + timestamps automáticos
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status, source)
    VALUES (NEW.id, NULL, NEW.status, 'created');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status, source)
    VALUES (NEW.id, OLD.status, NEW.status, 'update');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_logistics_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'shipped'::order_status AND (OLD.status IS DISTINCT FROM NEW.status) AND NEW.shipped_at IS NULL THEN
    NEW.shipped_at := now();
  END IF;
  IF NEW.status = 'delivered'::order_status AND (OLD.status IS DISTINCT FROM NEW.status) AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_logistics_timestamps ON public.orders;
CREATE TRIGGER orders_logistics_timestamps
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_logistics_timestamps();

DROP TRIGGER IF EXISTS orders_status_history_ins ON public.orders;
CREATE TRIGGER orders_status_history_ins
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

DROP TRIGGER IF EXISTS orders_status_history_upd ON public.orders;
CREATE TRIGGER orders_status_history_upd
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

-- 5. Conclusão automática após 7 dias sem devolução
CREATE OR REPLACE FUNCTION public.complete_delivered_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.orders o
     SET status = 'completed'::order_status
   WHERE o.status = 'delivered'::order_status
     AND o.delivered_at IS NOT NULL
     AND o.delivered_at <= now() - interval '7 days'
     AND NOT EXISTS (
       SELECT 1 FROM public.return_requests r
        WHERE r.order_id = o.id AND r.status IN ('open', 'approved', 'processing')
     );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
