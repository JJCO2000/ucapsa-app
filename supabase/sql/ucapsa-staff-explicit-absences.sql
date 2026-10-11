-- UCAPSA — explicit staff absence marks for hard attendance statistics.
--
-- A missing attendance row is not automatically an absence. Trainers can mark
-- "No asistió" explicitly; reports therefore distinguish present / absent /
-- unmarked without inventing negative attendance.

begin;

create table if not exists public.program_attendance_absences (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete restrict,
  attendance_date date not null,
  schedule_id uuid not null references public.program_schedules(id) on delete restrict,
  marked_by uuid references auth.users(id) on delete set null,
  notes text,
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint program_attendance_absences_unique unique (enrollment_id, attendance_date),
  constraint program_attendance_absences_notes_check
    check (notes is null or length(btrim(notes)) <= 1000)
);

create index if not exists program_attendance_absences_schedule_date_idx
  on public.program_attendance_absences (schedule_id, attendance_date);

alter table public.program_attendance_absences enable row level security;
revoke all on table public.program_attendance_absences from public, anon, authenticated;
grant select, insert, update, delete on table public.program_attendance_absences to service_role;

create or replace function public.staff_mark_program_absence(
  p_enrollment_id uuid,
  p_attendance_date date,
  p_schedule_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_absence_id uuid;
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede registrar una ausencia.'
      using errcode = '42501';
  end if;
  if p_attendance_date > v_today then
    raise exception 'No se puede registrar una ausencia futura.' using errcode = '22023';
  end if;

  select * into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id
  for update;

  if not found or v_enrollment.status <> 'active' then
    raise exception 'Inscripción activa no encontrada.' using errcode = '22023';
  end if;
  if v_enrollment.schedule_id <> p_schedule_id then
    raise exception 'El horario no corresponde a esta inscripción.' using errcode = '22023';
  end if;

  select * into v_schedule
  from public.get_effective_program_schedule(p_schedule_id, p_attendance_date)
  where program_id = v_enrollment.program_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'No existe una clase activa para esa fecha.' using errcode = '22023';
  end if;
  if not public.program_schedule_occurs_on_date(p_schedule_id, p_attendance_date) then
    raise exception 'La fecha no corresponde al horario/ciclo.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.program_class_cancellations c
    where c.schedule_id = p_schedule_id
      and c.cancellation_date = p_attendance_date
      and c.restored_at is null
  ) then
    raise exception 'La clase está cancelada.' using errcode = '22023';
  end if;
  if coalesce(v_enrollment.access_mode, 'card') <> 'membership'
     and (
       v_enrollment.card_started_on is null
       or v_enrollment.card_expires_on is null
       or p_attendance_date < v_enrollment.card_started_on
       or p_attendance_date > v_enrollment.card_expires_on
     ) then
    raise exception 'La tarjeta no está vigente para esa clase.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.program_attendances a
    where a.enrollment_id = p_enrollment_id
      and a.attendance_date = p_attendance_date
  ) then
    raise exception 'Ya existe una asistencia real para esta clase.'
      using errcode = '23505';
  end if;

  insert into public.program_attendance_absences (
    enrollment_id,
    attendance_date,
    schedule_id,
    marked_by,
    notes,
    cleared_at,
    cleared_by,
    updated_at
  ) values (
    p_enrollment_id,
    p_attendance_date,
    p_schedule_id,
    auth.uid(),
    nullif(btrim(p_notes), ''),
    null,
    null,
    clock_timestamp()
  )
  on conflict (enrollment_id, attendance_date)
  do update set
    schedule_id = excluded.schedule_id,
    marked_by = excluded.marked_by,
    notes = excluded.notes,
    cleared_at = null,
    cleared_by = null,
    updated_at = clock_timestamp()
  returning id into v_absence_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'program_attendance.staff_mark_absent',
    'program_attendance_absence',
    v_absence_id,
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'attendance_date', p_attendance_date,
      'schedule_id', p_schedule_id
    )
  );

  return v_absence_id;
end;
$$;

revoke all on function public.staff_mark_program_absence(uuid,date,uuid,text)
  from public, anon;
grant execute on function public.staff_mark_program_absence(uuid,date,uuid,text)
  to authenticated, service_role;

create or replace function public.clear_staff_absence_on_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.program_attendance_absences
  set
    cleared_at = clock_timestamp(),
    cleared_by = coalesce(new.marked_by, auth.uid()),
    updated_at = clock_timestamp()
  where enrollment_id = new.enrollment_id
    and attendance_date = new.attendance_date
    and cleared_at is null;

  return new;
end;
$$;

revoke all on function public.clear_staff_absence_on_attendance()
  from public, anon, authenticated;

drop trigger if exists clear_staff_absence_on_attendance
  on public.program_attendances;

create trigger clear_staff_absence_on_attendance
after insert on public.program_attendances
for each row execute function public.clear_staff_absence_on_attendance();

drop function public.get_staff_class_roster(date);
create or replace function public.get_staff_class_roster(p_class_date date)
returns table (
  schedule_id uuid,
  program_code text,
  program_name text,
  program_level text,
  schedule_name text,
  start_time time,
  enrollment_id uuid,
  user_id uuid,
  client_name text,
  dog_id uuid,
  dog_name text,
  rsvp_response text,
  attended boolean,
  absent boolean,
  safety_severity text,
  safety_note text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar el roster.'
      using errcode = '42501';
  end if;

  return query
  with eligible as (
    select
      e.id as enrollment_id,
      e.user_id,
      e.dog_id,
      coalesce(d.name, e.dog_name, 'Perro')::text as dog_name,
      e.schedule_id,
      p.code::text as program_code,
      p.name::text as program_name,
      e.program_level::text as program_level,
      effective.name::text as schedule_name,
      effective.start_time,
      coalesce(pr.full_name, pr.email, 'Cliente UCAPSA')::text as client_name
    from public.program_enrollments e
    join public.programs p on p.id = e.program_id and p.is_active = true
    join lateral public.get_effective_program_schedule(e.schedule_id, p_class_date) effective on true
    left join public.profiles pr on pr.user_id = e.user_id
    left join public.dogs d on d.id = e.dog_id
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
        select 1 from public.program_class_cancellations c
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
    x.enrollment_id,
    x.user_id,
    x.client_name,
    x.dog_id,
    x.dog_name,
    r.response,
    exists (
      select 1 from public.program_attendances a
      where a.enrollment_id = x.enrollment_id
        and a.attendance_date = p_class_date
    ) as attended,
    exists (
      select 1
      from public.program_attendance_absences ab
      where ab.enrollment_id = x.enrollment_id
        and ab.attendance_date = p_class_date
        and ab.cleared_at is null
    ) as absent,
    safety.severity,
    safety.note
  from eligible x
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = p_class_date
  left join lateral (
    select n.severity, n.note
    from public.ucapsa_staff_dog_notes n
    where n.dog_id = x.dog_id
      and n.resolved_at is null
      and n.severity in ('high','caution')
    order by
      case n.severity when 'high' then 0 else 1 end,
      n.happened_on desc,
      n.created_at desc
    limit 1
  ) safety on true
  order by x.start_time, x.program_code, x.program_level, x.dog_name;
end;
$$;
revoke all on function public.get_staff_class_roster(date) from public, anon;
grant execute on function public.get_staff_class_roster(date) to authenticated, service_role;

drop function public.get_staff_training_report(date,date);
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

comment on table public.program_attendance_absences is
  'Ausencias explícitas marcadas por staff. Un registro activo significa No asistió; cleared_at conserva correcciones cuando luego se registra asistencia.';
comment on function public.staff_mark_program_absence(uuid,date,uuid,text) is
  'Marca una ausencia explícita y auditable. Nunca infiere ausencia por falta de asistencia.';

commit;
