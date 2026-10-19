create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $uid$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$uid$;
create table public.profiles (
  user_id uuid primary key references auth.users(id),
  role text not null check(role in ('client','member','trainer','admin','super_admin'))
);
create or replace function public.is_ucapsa_admin()
returns boolean language sql stable security definer set search_path='' as $role$
  select exists(select 1 from public.profiles p where p.user_id=auth.uid()
    and p.role in ('admin','super_admin'))
$role$;
create table public.restaurant_menu_categories (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true
);
create table public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.restaurant_menu_categories(id),
  is_available boolean not null default true
);
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id),
  action text,entity_type text,entity_id uuid,details jsonb
);
insert into auth.users(id) values
('00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000002');
insert into public.profiles(user_id,role) values
('00000000-0000-4000-8000-000000000001','admin'),
('00000000-0000-4000-8000-000000000002','client');
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
