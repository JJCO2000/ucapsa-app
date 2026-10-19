-- Minimal isolated PostgreSQL fixture matching the UCAPSA production contracts
-- queried 2026-10-18. Only for GH Actions; NEVER run against real Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
grant usage on schema auth to authenticated;
create type public.app_role as enum ('client','member','admin','super_admin','trainer');
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text, phone text,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant execute on function auth.uid() to authenticated;
create table public.profiles (
  user_id uuid primary key references auth.users(id),
  full_name text, email text, phone text,
  role public.app_role not null default 'client'
);
create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  is_active boolean not null default true
);
create unique index dogs_user_name_unique on public.dogs(user_id, lower(btrim(name))) where is_active;
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null,
  required_attendances integer not null default 1,
  is_active boolean not null default true
);
create table public.program_schedules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id),
  name text not null,
  day_of_week integer not null,
  start_time time not null,
  sequence_order integer not null default 1,
  is_active boolean not null default true,
  repeat_type text not null default 'weekly',
  cycle_start_date date
);
create table public.program_class_cancellations (
  schedule_id uuid not null references public.program_schedules(id),
  cancellation_date date not null,
  restored_at timestamptz
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  status text not null default 'active',
  updated_at timestamptz not null default now()
);
create table public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  program_id uuid not null references public.programs(id),
  schedule_id uuid not null references public.program_schedules(id),
  dog_id uuid references public.dogs(id),
  dog_name text,
  physical_card_number text,
  program_level text not null default 'base' check (program_level in ('base','principiante','medio','avanzado')),
  access_mode text not null default 'card' check (access_mode in ('card','membership')),
  membership_id uuid references public.memberships(id),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  attendances_count integer not null default 0 check (attendances_count >= 0),
  last_attendance_at date,
  requirements_met_at timestamptz,
  started_at date default current_date,
  card_started_on date,
  card_expires_on date,
  completed_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  unlocked_from_enrollment_id uuid references public.program_enrollments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollment_membership_mode check (
    (access_mode='card' and membership_id is null)
    or (access_mode='membership' and membership_id is not null)
  ),
  constraint enrollment_card_dates check (
    card_started_on is null or card_expires_on is null or card_expires_on>=card_started_on
  )
);
create unique index program_enrollments_card_unique
  on public.program_enrollments(program_id, lower(btrim(physical_card_number)))
  where physical_card_number is not null;
create table public.program_attendances (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id),
  attendance_date date not null,
  unique(enrollment_id, attendance_date)
);
create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  dog_id uuid references public.dogs(id),
  achievement_code text not null,
  source_type text,
  source_id uuid,
  awarded_at timestamptz,
  awarded_by uuid references auth.users(id)
);
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);
create or replace function public.is_ucapsa_admin()
returns boolean stable security definer language sql set search_path='' as $$
  select exists(
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.role in ('admin','super_admin')
  )
$$;
grant execute on function public.is_ucapsa_admin() to authenticated;
create or replace function public.get_effective_program_schedule(p_id uuid, p_date date)
returns table (is_active boolean, sequence_order integer, day_of_week integer,
               start_time time, program_id uuid, name text)
language sql stable as $$
  select s.is_active,s.sequence_order,s.day_of_week,s.start_time,s.program_id,s.name
  from public.program_schedules s where s.id=p_id
$$;
create or replace function public.is_ucapsa_staff()
returns boolean stable security definer language sql set search_path='' as $staff_fn$
  select exists (select 1 from public.profiles p where p.user_id=auth.uid()
    and p.role in ('trainer','admin','super_admin'))
$staff_fn$;
create or replace function public.program_schedule_occurs_on_date(p_id uuid,p_date date)
returns boolean stable language sql as $occurs_fn$
  select exists(select 1 from public.program_schedules s where s.id=p_id
    and s.is_active and s.day_of_week=extract(dow from p_date)::int)
$occurs_fn$;
create or replace function public.trg_refresh_program_enrollment_progress()
returns trigger language plpgsql as $$
begin
  perform public.refresh_program_enrollment_progress(coalesce(new.enrollment_id,old.enrollment_id));
  return coalesce(new,old);
end
$$;
create trigger program_progress after insert or delete or update of attendance_date
on public.program_attendances for each row
execute function public.trg_refresh_program_enrollment_progress();
create or replace function public.set_program_enrollment_card_validity()
returns trigger language plpgsql as $$
begin
  if new.card_started_on is null then new.card_started_on:=coalesce(new.started_at,current_date); end if;
  if new.card_expires_on is null then new.card_expires_on:=(new.card_started_on+interval '1 year')::date; end if;
  return new;
end
$$;
create trigger program_card_validity before insert or update
on public.program_enrollments for each row execute function public.set_program_enrollment_card_validity();

insert into public.programs(code,name,required_attendances)
values('puppy','Puppy',4),('comandos','Comandos',6);
insert into public.program_schedules(program_id,name,day_of_week,start_time,sequence_order)
select id, 'Puppy 10:30',0,'10:30',1 from public.programs where code='puppy';
insert into public.program_schedules(program_id,name,day_of_week,start_time,sequence_order)
select id, 'Puppy 12:30',0,'12:30',2 from public.programs where code='puppy';
insert into public.program_schedules(program_id,name,day_of_week,start_time,sequence_order)
select id, 'Comandos 11:30',0,'11:30',1 from public.programs where code='comandos';

-- Synthetic identities only; no real persons or pets.
insert into auth.users(id,email,email_confirmed_at)
values ('00000000-0000-4000-8000-000000000001','admin@test.invalid',now()),
       ('00000000-0000-4000-8000-000000000002','client@test.invalid',now()),
       ('00000000-0000-4000-8000-000000000003','other@test.invalid',null),
       ('00000000-0000-4000-8000-000000000004','super@test.invalid',now()),
       ('00000000-0000-4000-8000-000000000005','trainer@test.invalid',now());
insert into public.profiles(user_id,email,role)
values ('00000000-0000-4000-8000-000000000001','admin@test.invalid','admin'),
       ('00000000-0000-4000-8000-000000000002','client@test.invalid','client'),
       ('00000000-0000-4000-8000-000000000003','other@test.invalid','client'),
       ('00000000-0000-4000-8000-000000000004','super@test.invalid','super_admin'),
       ('00000000-0000-4000-8000-000000000005','trainer@test.invalid','trainer');
-- Public RPCs need schema usage for signed-in actors.
grant usage on schema public to authenticated;
