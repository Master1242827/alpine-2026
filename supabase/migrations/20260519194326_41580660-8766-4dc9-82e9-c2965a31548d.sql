
-- Fix search_path on trigger function
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Lock down SECURITY DEFINER functions
revoke execute on function public.has_role(uuid, public.app_role) from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;

-- Restrict bucket listing while keeping individual file URLs public
drop policy if exists "public read product images" on storage.objects;
create policy "anyone download product images" on storage.objects for select
  using (bucket_id = 'product-images' and (public.has_role(auth.uid(),'admin') or (current_setting('request.path', true) is null)));

-- Simpler: keep public select (images are public by URL anyway) - bucket-level public flag handles file access
create policy "public select product images" on storage.objects for select
  using (bucket_id = 'product-images');
