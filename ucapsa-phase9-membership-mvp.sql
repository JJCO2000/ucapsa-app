-- UCAPSA Phase 9A - Membership MVP
-- SQL separado para Supabase. Ejecutar en SQL Editor antes del ZIP de codigo.

create extension if not exists pgcrypto;

alter table public.memberships
  add column if not exists current_payment_status text not null default 'pending';

alter table public.memberships
  add column if not exists last_payment_at timestamptz null;

alter table public.memberships
  add column if not exists payment_notes text null;

update public.memberships
set current_payment_status = 'pending'
where current_payment_status is null
   or current_payment_status not in ('pending', 'paid', 'not_required');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memberships_current_payment_status_check'
      and conrelid = 'public.memberships'::regclass
  ) then
    alter table public.memberships
      add constraint memberships_current_payment_status_check
      check (current_payment_status in ('pending', 'paid', 'not_required'));
  end if;
end $$;

alter table public.memberships
  alter column qr_token set default gen_random_uuid()::text;

create unique index if not exists memberships_qr_token_unique_idx
  on public.memberships (qr_token);

create unique index if not exists memberships_member_number_unique_idx
  on public.memberships (member_number)
  where member_number is not null;

create index if not exists memberships_admin_status_idx
  on public.memberships (status, current_payment_status, end_date, created_at desc);

-- No agregamos triggers que cambien automaticamente el rol del socio.
-- El admin decide manualmente si una membresia vencida se marca como expired/cancelled.
