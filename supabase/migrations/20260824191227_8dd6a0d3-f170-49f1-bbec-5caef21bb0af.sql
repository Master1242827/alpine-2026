-- Funções internas (triggers e cron): não devem ser chamáveis pela API pública.
revoke all on function public.handle_new_user() from anon, authenticated, public;
revoke all on function public.decrement_stock_on_paid() from anon, authenticated, public;
revoke all on function public.log_order_status_change() from anon, authenticated, public;
revoke all on function public.complete_delivered_orders() from anon, authenticated, public;

grant execute on function public.complete_delivered_orders() to service_role;

-- Getters públicos e somente-leitura usados pelo site: mantêm acesso mínimo e explícito.
revoke all on function public.get_hero_image_url() from public;
revoke all on function public.get_whatsapp_number() from public;
revoke all on function public.get_public_store_info() from public;
revoke all on function public.get_public_pix_settings() from public;
revoke all on function public.get_public_payment_settings() from public;

grant execute on function public.get_hero_image_url() to anon, authenticated, service_role;
grant execute on function public.get_whatsapp_number() to anon, authenticated, service_role;
grant execute on function public.get_public_store_info() to anon, authenticated, service_role;
grant execute on function public.get_public_pix_settings() to anon, authenticated, service_role;
grant execute on function public.get_public_payment_settings() to anon, authenticated, service_role;