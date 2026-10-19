-- Synthetic contract for membership lifecycle. PostgreSQL ephemeral CI only.
create schema auth;
create type public.app_role as enum('client','member','trainer','admin','super_admin');
create table public.profiles(
 user_id uuid primary key,
 role public.app_role not null,
 updated_at timestamptz default now()
);
create table public.memberships(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(user_id),
 status text not null check(status in ('active','cancelled','pending')),
 current_payment_status text not null default 'pending',
 updated_at timestamptz default now()
);
create table public.payment_obligations(
 id uuid primary key default gen_random_uuid(),
 membership_id uuid not null references public.memberships(id),
 cancelled_at timestamptz,
 cancelled_by uuid,
 updated_at timestamptz,
 due_date date not null default current_date,
 amount numeric not null default 10
);
create table public.payments(
 id uuid primary key default gen_random_uuid(),
 obligation_id uuid not null references public.payment_obligations(id),
 amount numeric not null,
 status text not null,
 voided_at timestamptz
);
create or replace function auth.uid() returns uuid stable language sql as $fn$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$fn$;

insert into public.profiles(user_id,role) values
 ('00000000-0000-4000-8000-000000000001','trainer'),
 ('00000000-0000-4000-8000-000000000002','client'),
 ('00000000-0000-4000-8000-000000000003','member'),
 ('00000000-0000-4000-8000-000000000004','admin'),
 ('00000000-0000-4000-8000-000000000005','super_admin');

create trigger trg_membership_status_lifecycle
after insert or delete or update on public.memberships
for each row execute function public.sync_membership_status_lifecycle();
