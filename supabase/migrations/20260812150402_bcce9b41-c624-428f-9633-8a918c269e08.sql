REVOKE ALL ON FUNCTION public.complete_delivered_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivered_orders() TO service_role;
REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_order_logistics_timestamps() FROM PUBLIC, anon, authenticated;