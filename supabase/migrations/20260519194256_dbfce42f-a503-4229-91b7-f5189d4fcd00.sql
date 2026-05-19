
-- Roles
create type public.app_role as enum ('admin', 'customer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Catalog
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  price_cents int not null,
  compare_at_cents int,
  stock int not null default 0,
  weight_kg numeric(10,3) not null default 1,
  length_cm int not null default 30,
  width_cm int not null default 30,
  height_cm int not null default 10,
  category_id uuid references public.categories(id) on delete set null,
  active boolean not null default true,
  featured boolean not null default false,
  images text[] not null default '{}',
  requires_vehicle_config boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.products (category_id);
create index on public.products (active);

-- Vehicle configurator
create table public.vehicle_makes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  image_url text,
  display_order int not null default 0
);

create table public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  make_id uuid references public.vehicle_makes(id) on delete cascade,
  name text not null,
  image_url text,
  year_range text,
  display_order int not null default 0
);

create table public.cabin_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  display_order int not null default 0
);

create table public.vehicle_product_map (
  id uuid primary key default gen_random_uuid(),
  model_id uuid references public.vehicle_models(id) on delete cascade,
  cabin_type_id uuid references public.cabin_types(id) on delete set null,
  year_from int,
  year_to int,
  product_id uuid references public.products(id) on delete cascade
);

create index on public.vehicle_product_map (model_id);

-- Orders
create type public.order_status as enum ('pending','paid','shipped','delivered','cancelled');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  shipping_address jsonb,
  shipping_cost_cents int not null default 0,
  shipping_service text,
  subtotal_cents int not null,
  total_cents int not null,
  status public.order_status not null default 'pending',
  mp_preference_id text,
  mp_payment_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.orders (status);
create index on public.orders (user_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity int not null,
  unit_price_cents int not null,
  vehicle_config jsonb
);

create index on public.order_items (order_id);

-- Store settings
create table public.store_settings (
  id int primary key default 1,
  whatsapp_number text not null default '5518988001823',
  origin_cep text not null default '',
  store_name text not null default 'AutoPremium',
  constraint single_row check (id = 1)
);

insert into public.store_settings (id) values (1);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.vehicle_makes enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.cabin_types enable row level security;
alter table public.vehicle_product_map enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.store_settings enable row level security;

-- Public catalog read
create policy "public read products" on public.products for select using (active = true or public.has_role(auth.uid(), 'admin'));
create policy "admin write products" on public.products for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "public read categories" on public.categories for select using (true);
create policy "admin write categories" on public.categories for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "public read vehicle_makes" on public.vehicle_makes for select using (true);
create policy "admin write vehicle_makes" on public.vehicle_makes for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "public read vehicle_models" on public.vehicle_models for select using (true);
create policy "admin write vehicle_models" on public.vehicle_models for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "public read cabin_types" on public.cabin_types for select using (true);
create policy "admin write cabin_types" on public.cabin_types for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "public read vehicle_product_map" on public.vehicle_product_map for select using (true);
create policy "admin write vehicle_product_map" on public.vehicle_product_map for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "public read store_settings" on public.store_settings for select using (true);
create policy "admin update store_settings" on public.store_settings for update using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Orders
create policy "read own orders or admin" on public.orders for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "anyone insert orders" on public.orders for insert with check (true);
create policy "admin update orders" on public.orders for update using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "read items via order" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
);
create policy "anyone insert order_items" on public.order_items for insert with check (true);

-- Profiles
create policy "read own profile or admin" on public.profiles for select using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- User roles
create policy "read own roles or admin" on public.user_roles for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "admin write user_roles" on public.user_roles for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- Storage bucket for product images
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

create policy "public read product images" on storage.objects for select using (bucket_id = 'product-images');
create policy "admin upload product images" on storage.objects for insert with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "admin update product images" on storage.objects for update using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "admin delete product images" on storage.objects for delete using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
