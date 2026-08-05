CREATE OR REPLACE FUNCTION public.decrement_stock_on_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid'::order_status
     AND (OLD.status IS NULL OR OLD.status <> 'paid'::order_status)
     AND NEW.stock_decremented = false THEN
    UPDATE public.products p
       SET stock = GREATEST(0, p.stock - oi.quantity)
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.product_id = p.id;
    NEW.stock_decremented := true;
  END IF;
  RETURN NEW;
END;
$function$;