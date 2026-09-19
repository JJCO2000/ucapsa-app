-- Preserve an auditable trace when Admin corrects attendance / visit history.
--
-- The canonical Rango 1 closed-season guards continue deciding whether the
-- underlying row may be deleted. These RPCs only add atomic evidence to the
-- existing append-only admin_audit_logs table before a mutable record is
-- corrected away.
--
-- Store the complete row under "before" so future columns are not silently
-- omitted from audit evidence.

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
      'before', to_jsonb(v_attendance)
    )
  );

  delete from public.program_attendances
  where id = v_attendance.id;

  -- Existing AFTER DELETE trigger also refreshes progress. Keep the explicit
  -- call for compatibility with the previous RPC contract; the refresh is
  -- idempotent and derives state from current rows.
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
      'before', to_jsonb(v_visit)
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
