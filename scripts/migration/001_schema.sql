-- Schema Equipilates (recriação no projeto corporativo Free)
-- Baseado em src/lib/database.types.ts + uso em runtime (site_settings)

create extension if not exists "pgcrypto";

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  title text not null,
  slug text not null unique,
  short_description text not null default '',
  detailed_description text not null default '',
  technical_specs jsonb not null default '[]'::jsonb,
  price numeric not null default 0,
  optional_items jsonb,
  seo_title text,
  seo_description text,
  seo_keywords text,
  seo_text text,
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title_en text,
  title_es text,
  title_de text,
  short_description_en text,
  short_description_es text,
  short_description_de text,
  detailed_description_en text,
  detailed_description_es text,
  detailed_description_de text
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt_text text,
  is_primary boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_is_active_idx on public.products(is_active);
create index if not exists product_images_product_id_idx on public.product_images(product_id);

-- RLS: leitura pública do catálogo; escrita autenticada (admin)
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.site_settings enable row level security;

-- Policies idempotentes
drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories" on public.categories for select using (true);

drop policy if exists "Auth write categories" on public.categories;
create policy "Auth write categories" on public.categories for all to authenticated using (true) with check (true);

drop policy if exists "Public read products" on public.products;
create policy "Public read products" on public.products for select using (true);

drop policy if exists "Auth write products" on public.products;
create policy "Auth write products" on public.products for all to authenticated using (true) with check (true);

drop policy if exists "Public read product_images" on public.product_images;
create policy "Public read product_images" on public.product_images for select using (true);

drop policy if exists "Auth write product_images" on public.product_images;
create policy "Auth write product_images" on public.product_images for all to authenticated using (true) with check (true);

drop policy if exists "Public read site_settings" on public.site_settings;
create policy "Public read site_settings" on public.site_settings for select using (true);

drop policy if exists "Auth write site_settings" on public.site_settings;
create policy "Auth write site_settings" on public.site_settings for all to authenticated using (true) with check (true);

-- Storage bucket (rodar no SQL editor OU criar no dashboard Storage)
-- insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
-- on conflict (id) do update set public = true;
