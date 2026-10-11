-- UCAPSA — asistencia operativa de Entrenador
--
-- Entrenador puede marcar que un perro asistió a una clase real.
-- No puede corregir/eliminar historia antigua ni cambiar horarios.
-- Correcciones y eliminaciones siguen siendo administrativas.

create or replace function public.trainer_register_program_attendance(
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
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_membership public.memberships%rowtype;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede registrar asistencias.'
      using errcode = '42501';
  end if;

  if p_attendance_date is null or p_schedule_id is null then
    raise exception 'Fecha y horario son obligatorios.'
      using errcode = '22023';
  end if;

  if p_attendance_date > v_today then
    raise exception 'No se puede registrar asistencia futura.'
      using errcode = '22023';
  end if;

  if p_attendance_date < v_today - 7 then
    raise exception 'Una asistencia de más de 7 días requiere corrección administrativa.'
      using errcode = '22023';
  end if;

  select *
    into v_enrollment
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.status = 'active';

  if not found then
    raise exception 'Inscripción activa no encontrada.'
      using errcode = '22023';
  end if;

  select *
    into v_schedule
  from public.get_effective_program_schedule(p_schedule_id, p_attendance_date)
  where program_id = v_enrollment.program_id
  limit 1;

  if not found or not coalesce(v_schedule.is_active, false) then
    raise exception 'Ese horario no estaba activo para el programa en esa fecha.'
      using errcode = '22023';
  end if;

  if not public.program_schedule_occurs_on_date(p_schedule_id, p_attendance_date) then
    raise exception 'La clase no corresponde al día/ciclo configurado para esa fecha.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.program_class_cancellations c
    where c.schedule_id = p_schedule_id
      and c.cancellation_date = p_attendance_date
      and c.restored_at is null
  ) then
    raise exception 'La clase de esa fecha está cancelada.'
      using errcode = '22023';
  end if;

  if coalesce(v_enrollment.access_mode, 'card') = 'membership' then
    select *
      into v_membership
    from public.memberships m
    where m.id = v_enrollment.membership_id
      and m.user_id = v_enrollment.user_id
      and m.status = 'active';

    if not found then
      raise exception 'La membresía que da acceso a esta clase no está activa.'
        using errcode = '22023';
    end if;

    if v_membership.start_date is not null and p_attendance_date < v_membership.start_date then
      raise exception 'La membresía todavía no estaba vigente en esa fecha.'
        using errcode = '22023';
    end if;

    if v_enrollment.dog_id is null or not exists (
      select 1
      from public.membership_dog_access a
      where a.membership_id = v_membership.id
        and a.dog_id = v_enrollment.dog_id
        and a.is_covered = true
    ) then
      raise exception 'Este perro no tiene acceso de entrenamiento por membresía.'
        using errcode = '22023';
    end if;
  else
    if v_enrollment.card_started_on is null or v_enrollment.card_expires_on is null then
      raise exception 'La vigencia de la tarjeta necesita revisión administrativa.'
        using errcode = '22023';
    end if;

    if p_attendance_date < v_enrollment.card_started_on
       or p_attendance_date > v_enrollment.card_expires_on then
      raise exception 'La tarjeta no estaba vigente para esa clase.'
        using errcode = '22023';
    end if;
  end if;

  select a.id
    into v_attendance_id
  from public.program_attendances a
  where a.enrollment_id = v_enrollment.id
    and a.attendance_date = p_attendance_date
  order by a.created_at asc
  limit 1;

  if v_attendance_id is not null then
    return v_attendance_id;
  end if;

  insert into public.program_sessions (
    schedule_id,
    session_date,
    scheduled_start_time,
    created_by
  ) values (
    v_schedule.schedule_id,
    p_attendance_date,
    v_schedule.start_time,
    auth.uid()
  )
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select s.id
      into v_session_id
    from public.program_sessions s
    where s.schedule_id = v_schedule.schedule_id
      and s.session_date = p_attendance_date;
  end if;

  insert into public.program_attendances (
    enrollment_id,
    attendance_date,
    session_id,
    source,
    marked_by,
    recorded_at,
    notes,
    outside_window
  ) values (
    v_enrollment.id,
    p_attendance_date,
    v_session_id,
    'trainer_manual',
    auth.uid(),
    clock_timestamp(),
    nullif(btrim(coalesce(p_notes, '')), ''),
    false
  )
  on conflict (enrollment_id, attendance_date) do nothing
  returning id into v_attendance_id;

  if v_attendance_id is null then
    select a.id
      into v_attendance_id
    from public.program_attendances a
    where a.enrollment_id = v_enrollment.id
      and a.attendance_date = p_attendance_date
    order by a.created_at asc
    limit 1;
  end if;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'trainer.program_attendance.register',
    'program_attendance',
    v_attendance_id,
    jsonb_build_object(
      'enrollment_id', v_enrollment.id,
      'dog_id', v_enrollment.dog_id,
      'attendance_date', p_attendance_date,
      'schedule_id', p_schedule_id
    )
  );

  return v_attendance_id;
end;
$$;

revoke all on function public.trainer_register_program_attendance(uuid,date,uuid,text)
  from public, anon;
grant execute on function public.trainer_register_program_attendance(uuid,date,uuid,text)
  to authenticated, service_role;

comment on function public.trainer_register_program_attendance(uuid,date,uuid,text) is
  'Marca asistencia real para una clase canónica dentro de una ventana operativa de 7 días. Correcciones/eliminaciones permanecen en Admin.';
