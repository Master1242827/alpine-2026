-- Configurator dynamic flow tables

create table if not exists public.configurator_questions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  help_text text,
  type text not null default 'single_choice',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.configurator_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.configurator_questions(id) on delete cascade,
  value text not null,
  label text not null,
  image_url text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (question_id, value)
);

create index if not exists idx_configurator_options_question on public.configurator_options(question_id, display_order);

create table if not exists public.vehicle_question_flow (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.vehicle_models(id) on delete cascade,
  question_id uuid not null references public.configurator_questions(id) on delete cascade,
  year_from integer,
  year_to integer,
  display_order integer not null default 0,
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_vqf_model on public.vehicle_question_flow(model_id, display_order);

-- Add answers jsonb to vehicle_product_map for dynamic matching
alter table public.vehicle_product_map
  add column if not exists answers jsonb not null default '{}'::jsonb;

create index if not exists idx_vpm_answers on public.vehicle_product_map using gin (answers);

-- RLS
alter table public.configurator_questions enable row level security;
alter table public.configurator_options enable row level security;
alter table public.vehicle_question_flow enable row level security;

drop policy if exists "public read configurator_questions" on public.configurator_questions;
create policy "public read configurator_questions" on public.configurator_questions for select using (true);
drop policy if exists "admin write configurator_questions" on public.configurator_questions;
create policy "admin write configurator_questions" on public.configurator_questions for all using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

drop policy if exists "public read configurator_options" on public.configurator_options;
create policy "public read configurator_options" on public.configurator_options for select using (true);
drop policy if exists "admin write configurator_options" on public.configurator_options;
create policy "admin write configurator_options" on public.configurator_options for all using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

drop policy if exists "public read vehicle_question_flow" on public.vehicle_question_flow;
create policy "public read vehicle_question_flow" on public.vehicle_question_flow for select using (true);
drop policy if exists "admin write vehicle_question_flow" on public.vehicle_question_flow;
create policy "admin write vehicle_question_flow" on public.vehicle_question_flow for all using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

-- updated_at trigger for questions
drop trigger if exists trg_configurator_questions_updated on public.configurator_questions;
create trigger trg_configurator_questions_updated before update on public.configurator_questions
  for each row execute function public.set_updated_at();