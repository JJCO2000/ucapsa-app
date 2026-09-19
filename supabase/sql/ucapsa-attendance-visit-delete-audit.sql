-- Preserve an auditable trace when Admin corrects attendance / visit history.
--
-- The canonical Rango 1 closed-season guards continue deciding whether the
-- underlying row may be deleted. These RPCs only add atomic evidence to the
-- existing admin_audit_logs table before a mutable record is corrected away.

create or replace function public.delete_program_attendance_admin(
  p_attendance_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendance public.program_attendances%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden quitar asistencias.';
  end if;

  select *
    into v_attendance
  from public.program_attendances
  where id = p_attendance_id
  for update;

  if not found then
    raise exception 'Asistencia no encontrada.';
  end if;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'program_attendance.delete',
    'program_attendance',
    v_attendance.id,
    jsonb_build_object(
      'enrollment_id', v_attendance.enrollment_id,
      'attendance_date', v_attendance.attendance_date,
      'marked_by', v_attendance.marked_by,
      'notes', v_attendance.notes,
      'session_id', v_attendance.session_id,
      'source', v_attendance.source,
      'recorded_at', v_attendance.recorded_at,
      'outside_window', v_attendance.outside_window,
      'client_event_id', v_attendance.client_event_id,
      'created_at', v_attendance.created_at,
      'updated_at', v_attendance.updated_at
    )
  );

  delete from public.program_attendances
  where id = v_attendance.id;

  perform public.refresh_program_enrollment_progress(v_attendance.enrollment_id);
end;
$$;

revoke all on function public.delete_program_attendance_admin(uuid)
  from public, anon;
grant execute on function public.delete_program_attendance_admin(uuid)
  to authenticated, service_role;

create or replace function public.delete_member_visit_admin(
  p_visit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.member_visits%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden quitar visitas.';
  end if;

  select *
    into v_visit
  from public.member_visits
  where id = p_visit_id
  for update;

  if not found then
    raise exception 'Visita no encontrada.';
  end if;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'member_visit.delete',
    'member_visit',
    v_visit.id,
    jsonb_build_object(
      'user_id', v_visit.user_id,
      'membership_id', v_visit.membership_id,
      'visited_at', v_visit.visited_at,
      'visit_date', v_visit.visit_date,
      'source', v_visit.source,
      'recorded_by', v_visit.recorded_by,
      'notes', v_visit.notes,
      'client_event_id', v_visit.client_event_id,
      'created_at', v_visit.created_at,
      'updated_at', v_visit.updated_at
    )
  );

  delete from public.member_visits
  where id = v_visit.id;
end;
$$;

revoke all on function public.delete_member_visit_admin(uuid)
  from public, anon;
grant execute on function public.delete_member_visit_admin(uuid)
  to authenticated, service_role;
