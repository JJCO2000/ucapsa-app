-- Sesiones de staff orientadas al horario oficial, aun con 0 inscripciones.
-- SSOT: program_schedules + get_effective_program_schedule + program_class_cancellations.
-- Los niveles de Comandos siguen agrupados en un schedule_id.
-- Sólo lectura; no cambia ni inventa asistencias, visitas ni inscripciones.
create or replace function public.get_staff_class_rsvp_summary(p_class_date date)
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
as $function$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar clases.'
      using errcode = '42501';
  end if;

  return query
  with scheduled as (
    select
      s.id as schedule_id,
      p.id as program_id,
      p.code::text as program_code,
      p.name::text as program_name,
      effective.name::text as schedule_name,
      effective.start_time
    from public.program_schedules s
    join public.programs p on p.id = s.program_id and p.is_active = true
    join lateral public.get_effective_program_schedule(s.id, p_class_date) effective on true
    where effective.program_id = s.program_id
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
        select 1 from public.program_class_cancellations c
        where c.schedule_id = s.id
          and c.cancellation_date = p_class_date
          and c.restored_at is null
      )
  ),
  eligible as (
    select
      e.id as enrollment_id,
      e.schedule_id,
      e.program_level::text as program_level
    from public.program_enrollments e
    join scheduled s on s.schedule_id = e.schedule_id and s.program_id = e.program_id
    where e.status = 'active'
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
    s.schedule_id,
    s.program_code,
    s.program_name,
    coalesce(x.program_level, 'basico')::text,
    s.schedule_name,
    s.start_time,
    count(x.enrollment_id)::integer,
    count(x.enrollment_id) filter (where r.response = 'yes')::integer,
    count(x.enrollment_id) filter (where r.response = 'no')::integer,
    count(x.enrollment_id) filter (where r.response is null)::integer
  from scheduled s
  left join eligible x on x.schedule_id = s.schedule_id
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = p_class_date
  group by
    s.schedule_id, s.program_code, s.program_name, x.program_level,
    s.schedule_name, s.start_time
  order by s.start_time, s.program_code, x.program_level;
end;
$function$;

revoke all on function public.get_staff_class_rsvp_summary(date) from public, anon;
grant execute on function public.get_staff_class_rsvp_summary(date) to authenticated, service_role;
