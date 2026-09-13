-- UCAPSA Cambio 4.1 — Menú del restaurante
-- Ejecutar en Supabase SQL Editor.
-- Crea categorías y productos editables por admin/super_admin y visibles para usuarios/visitantes.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.restaurant_menu_categories(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null default 0 check (price >= 0),
  image_url text,
  sort_order integer not null default 0,
  is_available boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_menu_categories_sort_idx
  on public.restaurant_menu_categories(sort_order, name);
create index if not exists restaurant_menu_items_category_sort_idx
  on public.restaurant_menu_items(category_id, sort_order, name);
create index if not exists restaurant_menu_items_available_idx
  on public.restaurant_menu_items(is_available);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_restaurant_menu_categories_updated_at on public.restaurant_menu_categories;
create trigger set_restaurant_menu_categories_updated_at
before update on public.restaurant_menu_categories
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_restaurant_menu_items_updated_at on public.restaurant_menu_items;
create trigger set_restaurant_menu_items_updated_at
before update on public.restaurant_menu_items
for each row
execute function public.set_updated_at_timestamp();

alter table public.restaurant_menu_categories enable row level security;
alter table public.restaurant_menu_items enable row level security;

-- El menú no contiene información privada. Lectura pública para que funcione también sin iniciar sesión.
drop policy if exists "Public can read restaurant categories" on public.restaurant_menu_categories;
create policy "Public can read restaurant categories"
on public.restaurant_menu_categories
for select
to anon, authenticated
using (true);

drop policy if exists "Public can read restaurant items" on public.restaurant_menu_items;
create policy "Public can read restaurant items"
on public.restaurant_menu_items
for select
to anon, authenticated
using (true);

-- Administración: solo perfiles admin/super_admin.
drop policy if exists "Admins can insert restaurant categories" on public.restaurant_menu_categories;
create policy "Admins can insert restaurant categories"
on public.restaurant_menu_categories
for insert
to authenticated
with check (public.is_ucapsa_admin());

drop policy if exists "Admins can update restaurant categories" on public.restaurant_menu_categories;
create policy "Admins can update restaurant categories"
on public.restaurant_menu_categories
for update
to authenticated
using (public.is_ucapsa_admin())
with check (public.is_ucapsa_admin());

drop policy if exists "Admins can delete restaurant categories" on public.restaurant_menu_categories;
create policy "Admins can delete restaurant categories"
on public.restaurant_menu_categories
for delete
to authenticated
using (public.is_ucapsa_admin());

drop policy if exists "Admins can insert restaurant items" on public.restaurant_menu_items;
create policy "Admins can insert restaurant items"
on public.restaurant_menu_items
for insert
to authenticated
with check (public.is_ucapsa_admin());

drop policy if exists "Admins can update restaurant items" on public.restaurant_menu_items;
create policy "Admins can update restaurant items"
on public.restaurant_menu_items
for update
to authenticated
using (public.is_ucapsa_admin())
with check (public.is_ucapsa_admin());

drop policy if exists "Admins can delete restaurant items" on public.restaurant_menu_items;
create policy "Admins can delete restaurant items"
on public.restaurant_menu_items
for delete
to authenticated
using (public.is_ucapsa_admin());

-- Opcional para el primer arranque: no se insertan productos inventados.
-- El menú inicia vacío y se llena desde Admin > Restaurante.
