-- UCAPSA — confirmación de asistencia prevista a clases
--
-- Objetivo:
-- - el cliente puede indicar "voy a asistir" o "no podré ir";
-- - esto NO registra asistencia real;
-- - Admin ve el aforo esperado por clase/horario;
-- - cambios de horario y cancelaciones se resuelven siempre contra el horario
--   efectivo de la fecha, por lo que una confirmación vieja nunca crea una
--   clase fantasma ni cuenta una clase cancelada.

begin;

create table if not exists public.program_class_rsvps (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_date date not null,
  response text not null,
  responded_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint program_class_rsvps_response_check
    check (response = any (array['yes'::text, 'no'::text])),
  constraint program_class_rsvps_enrollment_date_unique
    unique (enrollment_id, class_date)
);

create index if not exists program_class_rsvps_user_date_idx
  on public.program_class_rsvps (user_id, class_date);

create index if not exists program_class_rsvps_date_response_idx
  on public.program_class_rsvps (class_date, response);

alter table public.program_class_rsvps enable row level security;

revoke all on table public.program_class_rsvps from public, anon, authenticated;
grant select, insert, update, delete on table public.program_class_rsvps to service_role;

create or replace function public.set_my_class_rsvp(
  p_enrollment_id uuid,
  p_class_date date,
  p_response text
)
returns table (
  enrollment_id uuid,
  class_date date,
  response text,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.program_enrollments%rowtype;
  v_effective record;
  v_response text := lower(btrim(coalesce(p_response, '')));
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
  v_occurs boolean := false;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para confirmar tu clase.'
      using errcode = '42501';
  end if;

  if v_response not in ('yes', 'no') then
    raise exception 'Respuesta no válida.'
      using errcode = '22023';
  end if;

  if p_class_date < v_today then
    raise exception 'No puedes confirmar una clase pasada.'
      using errcode = '22023';
  end if;

  select *
    into v_enrollment
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.user_id = v_user_id
    and e.status = 'active';

  if not found then
    raise exception 'Inscripción activa no encontrada.'
      using errcode = '42501';
  end if;

  select *
    into v_effective
  from public.get_effective_program_schedule(v_enrollment.schedule_id, p_class_date)
  limit 1;

  if not found
     or v_effective.program_id <> v_enrollment.program_id
     or not v_effective.is_active then
    raise exception 'No hay una clase activa para esa fecha.'
      using errcode = '22023';
  end if;

  v_occurs :=
    extract(dow from p_class_date)::integer = v_effective.day_of_week
    and (
      v_effective.repeat_type <> 'biweekly'
      or (
        v_effective.cycle_start_date is not null
        and p_class_date >= v_effective.cycle_start_date
        and mod(((p_class_date - v_effective.cycle_start_date) / 7)::integer, 2) = 0
      )
    );

  if not v_occurs then
    raise exception 'La clase no ocurre en esa fecha.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.program_class_cancellations c
    where c.schedule_id = v_enrollment.schedule_id
      and c.cancellation_date = p_class_date
      and c.restored_at is null
  ) then
    raise exception 'La clase está cancelada.'
      using errcode = '22023';
  end if;

  if coalesce(v_enrollment.access_mode, 'card') <> 'membership'
     and (
       v_enrollment.card_started_on is null
       or v_enrollment.card_expires_on is null
       or p_class_date < v_enrollment.card_started_on
       or p_class_date > v_enrollment.card_expires_on
     ) then
    raise exception 'Tu acceso no está vigente para esa clase.'
      using errcode = '22023';
  end if;

  insert into public.program_class_rsvps (
    enrollment_id,
    user_id,
    class_date,
    response,
    responded_at,
    updated_at
  ) values (
    v_enrollment.id,
    v_user_id,
    p_class_date,
    v_response,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (enrollment_id, class_date) do update
  set
    user_id = excluded.user_id,
    response = excluded.response,
    responded_at = clock_timestamp(),
    updated_at = clock_timestamp();

  return query
  select
    r.enrollment_id,
    r.class_date,
    r.response,
    r.responded_at
  from public.program_class_rsvps r
  where r.enrollment_id = v_enrollment.id
    and r.class_date = p_class_date;
end;
$$;

revoke all on function public.set_my_class_rsvp(uuid,date,text)
  from public, anon;
grant execute on function public.set_my_class_rsvp(uuid,date,text)
  to authenticated, service_role;

create or replace function public.get_my_class_rsvp(
  p_enrollment_id uuid,
  p_class_date date
)
returns table (
  enrollment_id uuid,
  class_date date,
  response text,
  responded_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    r.enrollment_id,
    r.class_date,
    r.response,
    r.responded_at
  from public.program_class_rsvps r
  join public.program_enrollments e on e.id = r.enrollment_id
  where r.enrollment_id = p_enrollment_id
    and r.class_date = p_class_date
    and e.user_id = auth.uid()
    and r.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.get_my_class_rsvp(uuid,date)
  from public, anon;
grant execute on function public.get_my_class_rsvp(uuid,date)
  to authenticated, service_role;

create or replace function public.get_admin_class_rsvp_summary(
  p_class_date date
)
returns table (
  schedule_id uuid,
  program_code text,
  program_name text,
  program_level text,
  schedule_name text,
  start_time time,
  eligible_count integer,
  confirmed_count integer,
  declined_count integer,
  no_response_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede consultar confirmaciones de clase.'
      using errcode = '42501';
  end if;

  return query
  with eligible as (
    select
      e.id as enrollment_id,
      e.schedule_id,
      p.code::text as program_code,
      p.name::text as program_name,
      e.program_level::text as program_level,
      effective.name::text as schedule_name,
      effective.start_time
    from public.program_enrollments e
    join public.programs p
      on p.id = e.program_id
     and p.is_active = true
    join lateral public.get_effective_program_schedule(e.schedule_id, p_class_date) effective
      on true
    where e.status = 'active'
      and effective.program_id = e.program_id
      and effective.is_active = true
      and extract(dow from p_class_date)::integer = effective.day_of_week
      and (
        effective.repeat_type <> 'biweekly'
        or (
          effective.cycle_start_date is not null
          and p_class_date >= effective.cycle_start_date
          and mod(((p_class_date - effective.cycle_start_date) / 7)::integer, 2) = 0
        )
      )
      and not exists (
        select 1
        from public.program_class_cancellations c
        where c.schedule_id = e.schedule_id
          and c.cancellation_date = p_class_date
          and c.restored_at is null
      )
      and (
        coalesce(e.access_mode, 'card') = 'membership'
        or (
          e.card_started_on is not null
          and e.card_expires_on is not null
          and p_class_date between e.card_started_on and e.card_expires_on
        )
      )
  )
  select
    x.schedule_id,
    x.program_code,
    x.program_name,
    x.program_level,
    x.schedule_name,
    x.start_time,
    count(*)::integer as eligible_count,
    count(*) filter (where r.response = 'yes')::integer as confirmed_count,
    count(*) filter (where r.response = 'no')::integer as declined_count,
    count(*) filter (where r.response is null)::integer as no_response_count
  from eligible x
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = p_class_date
  group by
    x.schedule_id,
    x.program_code,
    x.program_name,
    x.program_level,
    x.schedule_name,
    x.start_time
  order by
    x.start_time,
    x.program_code,
    x.program_level;
end;
$$;

revoke all on function public.get_admin_class_rsvp_summary(date)
  from public, anon;
grant execute on function public.get_admin_class_rsvp_summary(date)
  to authenticated, service_role;

comment on table public.program_class_rsvps is
  'Intención previa de asistencia. Nunca sustituye ni crea program_attendances.';
comment on function public.set_my_class_rsvp(uuid,date,text) is
  'Confirma o declina una clase futura sólo si la inscripción, horario efectivo, vigencia y cancelación permiten esa ocurrencia.';
comment on function public.get_admin_class_rsvp_summary(date) is
  'Aforo esperado por horario basado en la configuración efectiva de esa fecha; excluye clases canceladas y accesos no vigentes.';

commit;
