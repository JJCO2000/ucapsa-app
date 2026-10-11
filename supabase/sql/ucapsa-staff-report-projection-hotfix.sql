-- Hotfix for existing projects: projected user/dog fields were absent in
-- eligible CTE despite being selected downstream as x.user_id/x.dog_id.
-- Keep reporting security and result shape unchanged.
BEGIN;

create or replace function public.get_staff_training_report(
  p_start_date date,
  p_end_date date
)
returns table (
  class_date date,
  schedule_id uuid,
  program_code text,
  program_name text,
  program_level text,
  start_time time,
  enrollment_id uuid,
  user_id uuid,
  dog_id uuid,
  client_name text,
  dog_name text,
  rsvp_response text,
  attended boolean,
  absent boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede generar reportes operativos.'
      using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Rango de fechas inválido.' using errcode = '22023';
  end if;
  if (p_end_date - p_start_date) > 365 then
    raise exception 'El reporte permite como máximo 366 días.' using errcode = '22023';
  end if;

  return query
  with dates as (
    select gs::date as class_date
    from generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') gs
  ),
  eligible as (
    select
      dte.class_date,
      e.id as enrollment_id,
      e.schedule_id,
      e.user_id,
      e.dog_id,
      p.code::text as program_code,
      p.name::text as program_name,
      e.program_level::text as program_level,
      effective.start_time,
      coalesce(pr.full_name, pr.email, 'Cliente UCAPSA')::text as client_name,
      coalesce(d.name, e.dog_name, 'Perro')::text as dog_name
    from dates dte
    join public.program_enrollments e
      on coalesce(e.started_at, e.created_at::date) <= dte.class_date
     and (e.completed_at is null or e.completed_at::date >= dte.class_date)
     and (e.cancelled_at is null or e.cancelled_at::date >= dte.class_date)
    join public.programs p on p.id = e.program_id
    join lateral public.get_effective_program_schedule(e.schedule_id, dte.class_date) effective on true
    left join public.profiles pr on pr.user_id = e.user_id
    left join public.dogs d on d.id = e.dog_id
    where effective.program_id = e.program_id
      and effective.is_active = true
      and extract(dow from dte.class_date)::integer = effective.day_of_week
      and (
        effective.repeat_type <> 'biweekly'
        or (
          effective.cycle_start_date is not null
          and dte.class_date >= effective.cycle_start_date
          and mod(((dte.class_date - effective.cycle_start_date) / 7)::integer, 2) = 0
        )
      )
      and not exists (
        select 1 from public.program_class_cancellations c
        where c.schedule_id = e.schedule_id
          and c.cancellation_date = dte.class_date
          and c.restored_at is null
      )
      and (
        coalesce(e.access_mode, 'card') = 'membership'
        or (
          e.card_started_on is not null
          and e.card_expires_on is not null
          and dte.class_date between e.card_started_on and e.card_expires_on
        )
      )
  )
  select
    x.class_date,
    x.schedule_id,
    x.program_code,
    x.program_name,
    x.program_level,
    x.start_time,
    x.enrollment_id,
    x.user_id,
    x.dog_id,
    x.client_name,
    x.dog_name,
    r.response,
    exists (
      select 1
      from public.program_attendances a
      where a.enrollment_id = x.enrollment_id
        and a.attendance_date = x.class_date
    ) as attended,
    exists (
      select 1
      from public.program_attendance_absences ab
      where ab.enrollment_id = x.enrollment_id
        and ab.attendance_date = x.class_date
        and ab.cleared_at is null
    ) as absent
  from eligible x
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = x.class_date
  order by x.class_date, x.start_time, x.program_code, x.program_level, x.dog_name;
end;
$$;
revoke all on function public.get_staff_training_report(date,date) from public, anon;
grant execute on function public.get_staff_training_report(date,date) to authenticated, service_role;

COMMIT;
