-- UCAPSA role integration fixture, isolated synthetic identities only.
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create schema auth;
create type public.app_role as enum ('client','member','trainer','admin','super_admin');
create type public.membership_status as enum ('none','pending','active','expired','rejected','cancelled');
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable as $authid$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$authid$;
create table public.profiles (
 user_id uuid primary key references auth.users(id),
 role public.app_role not null default 'client',
 updated_at timestamptz default now()
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id),
 member_number text unique,
 status public.membership_status not null default 'pending',
 start_date date,end_date date,
 qr_token text not null default gen_random_uuid()::text,
 approved_by uuid references auth.users(id),
 current_payment_status text not null default 'pending'
   check(current_payment_status in ('pending','paid','not_required')),
 last_payment_at timestamptz,
 payment_notes text,
 updated_at timestamptz default now()
);
create table public.admin_audit_logs (
 id uuid primary key default gen_random_uuid(),
 admin_user_id uuid references auth.users(id),
 action text,entity_type text,entity_id uuid,details jsonb,
 created_at timestamptz default now()
);
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),
 ('00000000-0000-4000-8000-000000000004'),
 ('00000000-0000-4000-8000-000000000005');
insert into public.profiles(user_id,role) values
 ('00000000-0000-4000-8000-000000000001','super_admin'),
 ('00000000-0000-4000-8000-000000000002','client'),
 ('00000000-0000-4000-8000-000000000003','member'),
 ('00000000-0000-4000-8000-000000000004','trainer'),
 ('00000000-0000-4000-8000-000000000005','admin');
insert into public.memberships(user_id,status,member_number,start_date,current_payment_status,last_payment_at)
values('00000000-0000-4000-8000-000000000003','active','SOC-ALREADY','2026-04-02','paid','2026-04-02T12:00:00Z');
grant usage on schema public,auth to authenticated;
grant execute on function auth.uid() to authenticated;
