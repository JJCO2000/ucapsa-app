-- UCAPSA — auditable correction of attendance and member-visit history
--
-- Delete RPCs already snapshot "before" into admin_audit_logs. Corrections
-- mutate the same historical facts, so they must preserve equivalent evidence.
-- The business mutation and its audit row remain atomic in one transaction.

create or replace function public.correct_program_attendance_admin(
  p_attendance_id uuid,
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
  v_attendance public.program_attendances%rowtype;
  v_after public.program_attendances%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_session_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden corregir asistencias.';
  end if;

  if p_attendance_date > (clock_timestamp() at time zone 'America/Mexico_City')::date then
    raise exception 'No se puede registrar asistencia en una fecha futura.';
  end if;

  select *
    into v_attendance
  from public.program_attendances
  where id = p_attendance_id
  for update;

  if not found then
    raise exception 'Asistencia no encontrada.';
  end if;

  select *
    into v_enrollment
  from public.program_enrollments
  where id = v_attendance.enrollment_id;

  if not found then
    raise exception 'Inscripcion no encontrada.';
  end if;

  select *
    into v_schedule
  from public.get_effective_program_schedule(p_schedule_id, p_attendance_date)
  where program_id = v_enrollment.program_id;

  if not found then
    raise exception 'El horario no pertenece al programa o no existia en esa fecha.';
  end if;

  if not public.program_schedule_occurs_on_date(p_schedule_id, p_attendance_date) then
    raise exception 'La fecha no corresponde al horario y ciclo configurados para esa fecha.';
  end if;

  if exists (
    select 1
    from public.program_class_cancellations c
    where c.schedule_id = p_schedule_id
      and c.cancellation_date = p_attendance_date
      and c.restored_at is null
  ) then
    raise exception 'La clase de esa fecha esta cancelada.';
  end if;

  if exists (
    select 1
    from public.program_attendances a
    where a.enrollment_id = v_attendance.enrollment_id
      and a.attendance_date = p_attendance_date
      and a.id <> p_attendance_id
  ) then
    raise exception 'Ya existe otra asistencia para esta inscripcion en esa fecha.';
  end if;

  insert into public.program_sessions (
    schedule_id,
    session_date,
    scheduled_start_time,
    created_by
  )
  values (
    p_schedule_id,
    p_attendance_date,
    v_schedule.start_time,
    auth.uid()
  )
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id
      into v_session_id
    from public.program_sessions
    where schedule_id = p_schedule_id
      and session_date = p_attendance_date;
  end if;

  if exists (
    select 1
    from public.program_attendances a
    where a.session_id = v_session_id
      and a.enrollment_id = v_attendance.enrollment_id
      and a.id <> p_attendance_id
  ) then
    raise exception 'Ya existe otra asistencia para esta clase.';
  end if;

  update public.program_attendances
  set attendance_date = p_attendance_date,
      session_id = v_session_id,
      source = 'admin_manual',
      marked_by = auth.uid(),
      recorded_at = now(),
      notes = nullif(btrim(p_notes), ''),
      updated_at = now()
  where id = p_attendance_id
  returning * into v_after;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'program_attendance.correct',
    'program_attendance',
    v_after.id,
    jsonb_build_object(
      'before', to_jsonb(v_attendance),
      'after', to_jsonb(v_after)
    )
  );

  return p_attendance_id;
end;
$$;

revoke all on function public.correct_program_attendance_admin(uuid, date, uuid, text)
  from public, anon;
grant execute on function public.correct_program_attendance_admin(uuid, date, uuid, text)
  to authenticated, service_role;

create or replace function public.correct_member_visit_admin(
  p_visit_id uuid,
  p_visited_at timestamptz,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.member_visits%rowtype;
  v_after public.member_visits%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden corregir visitas.';
  end if;

  select *
    into v_before
  from public.member_visits
  where id = p_visit_id
  for update;

  if not found then
    raise exception 'Visita no encontrada.';
  end if;

  update public.member_visits
  set visited_at = p_visited_at,
      visit_date = (p_visited_at at time zone 'America/Mexico_City')::date,
      notes = nullif(btrim(p_notes), ''),
      recorded_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into v_after;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'member_visit.correct',
    'member_visit',
    v_after.id,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after', to_jsonb(v_after)
    )
  );
end;
$$;

revoke all on function public.correct_member_visit_admin(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.correct_member_visit_admin(uuid, timestamptz, text)
  to authenticated, service_role;
