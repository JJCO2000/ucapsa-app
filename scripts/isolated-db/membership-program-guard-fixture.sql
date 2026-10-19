-- Synthetic PostgreSQL fixture only. No production identities or server data.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table public.memberships (
 id uuid primary key,
 status text not null check(status in ('active','cancelled','pending')),
 current_payment_status text not null default 'paid'
);
create table public.program_enrollments (
 id uuid primary key,
 membership_id uuid references public.memberships(id),
 access_mode text not null check(access_mode in ('card','membership')),
 status text not null check(status in ('active','cancelled','completed')),
 check ((access_mode='membership' and membership_id is not null)
       or (access_mode='card' and membership_id is null))
);
-- Simulate the legacy AFTER trigger that cancels member-funded program enrollments.
create or replace function public.trg_cancel_membership_programs() returns trigger
language plpgsql as $fn$
begin
 if new.status <> 'active' then
  update public.program_enrollments set status='cancelled'
  where membership_id=new.id and access_mode='membership' and status='active';
 end if;
 return new;
end;
$fn$;
create trigger trg_cancel_membership_programs after update of status
on public.memberships for each row execute function public.trg_cancel_membership_programs();
insert into public.memberships(id,status) values
 ('00000000-0000-4000-8000-000000000001','active'),
 ('00000000-0000-4000-8000-000000000002','active'),
 ('00000000-0000-4000-8000-000000000003','active');
insert into public.program_enrollments(id,membership_id,access_mode,status) values
 ('00000000-0000-4000-8000-100000000001','00000000-0000-4000-8000-000000000001','membership','active'),
 ('00000000-0000-4000-8000-100000000002','00000000-0000-4000-8000-000000000002','membership','completed'),
 ('00000000-0000-4000-8000-100000000003','00000000-0000-4000-8000-000000000003','membership','cancelled');
