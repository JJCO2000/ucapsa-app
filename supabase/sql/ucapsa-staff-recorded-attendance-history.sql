-- UCAPSA — consulta de asistencia registrada (no modificar roster esperado).
-- Una asistencia registrada siempre debe ser visible a staff, incluso si la
-- inscripción terminó, cambió el horario o su fecha no coincide con sesión.
-- NO se infiere asistencia por RSVP, horario, ausencia ni por conteos.
begin;

create or replace function public.get_staff_recorded_attendance(
  p_start_date date,
  p_end_date date
)
returns table (
  attendance_id uuid,
  class_date date,
  program_code text,
  program_name text,
  program_level text,
  enrollment_status text,
  schedule_id uuid,
  schedule_time time,
  enrollment_id uuid,
  client_name text,
  dog_name text,
  attendance_source text,
  outside_window boolean,
  schedule_match_status text
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar la asistencia registrada.'
      using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null
     or p_end_date < p_start_date
     or (p_end_date - p_start_date) > 366 then
    raise exception 'Rango de fechas inválido: máximo 366 días.'
      using errcode = '22023';
  end if;

  return query
  select
    a.id,
    a.attendance_date,
    p.code::text,
    p.name::text,
    e.program_level::text,
    e.status::text,
    e.schedule_id,
    effective.start_time,
    e.id,
    coalesce(pr.full_name, pr.email, 'Cliente UCAPSA')::text,
    coalesce(d.name, e.dog_name, 'Perro')::text,
    a.source::text,
    coalesce(a.outside_window, false),
    case
      when e.started_at is not null and a.attendance_date < e.started_at
        then 'before_enrollment'
      when effective.schedule_id is null then 'no_schedule'
      when effective.is_active is false then 'inactive_schedule'
      when exists (
        select 1 from public.program_class_cancellations c
        where c.schedule_id = e.schedule_id
          and c.cancellation_date = a.attendance_date
          and c.restored_at is null
      ) then 'cancelled_class'
      when extract(dow from a.attendance_date)::integer <> effective.day_of_week
        then 'outside_day'
      when effective.repeat_type = 'biweekly' and (
        effective.cycle_start_date is null
        or a.attendance_date < effective.cycle_start_date
        or mod(((a.attendance_date - effective.cycle_start_date) / 7)::integer, 2) <> 0
      ) then 'outside_cycle'
      else 'matches_schedule'
    end::text
  from public.program_attendances a
  join public.program_enrollments e on e.id = a.enrollment_id
  join public.programs p on p.id = e.program_id
  left join public.profiles pr on pr.user_id = e.user_id
  left join public.dogs d on d.id = e.dog_id
  left join lateral public.get_effective_program_schedule(
    e.schedule_id, a.attendance_date
  ) effective on true
  where a.attendance_date between p_start_date and p_end_date
  order by a.attendance_date desc, p.code, e.id, a.id;
end;
$function$;

revoke all on function public.get_staff_recorded_attendance(date,date)
  from public, anon;
grant execute on function public.get_staff_recorded_attendance(date,date)
  to authenticated, service_role;

commit;
