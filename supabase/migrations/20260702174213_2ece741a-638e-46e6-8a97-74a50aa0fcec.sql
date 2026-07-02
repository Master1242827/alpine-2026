
-- CNPJ da loja + imagens em observações + trigger de baixa de estoque
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes_images text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_decremented boolean NOT NULL DEFAULT false;

-- Trigger: quando pedido vai para 'paid', decrementa o estoque uma única vez
CREATE OR REPLACE FUNCTION public.decrement_stock_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status,'') <> 'paid' AND NEW.stock_decremented = false THEN
    UPDATE public.products p
       SET stock = GREATEST(0, p.stock - oi.quantity)
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.product_id = p.id;
    NEW.stock_decremented := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_decrement_stock ON public.orders;
CREATE TRIGGER orders_decrement_stock
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.decrement_stock_on_paid();

-- Expor CNPJ na RPC pública
CREATE OR REPLACE FUNCTION public.get_public_store_info()
RETURNS TABLE (store_name text, whatsapp_number text, cnpj text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_name, whatsapp_number, cnpj FROM public.store_settings WHERE id = 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_store_info() TO anon, authenticated;
