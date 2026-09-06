CREATE OR REPLACE FUNCTION public.guard_program_exam_client_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.status := 'requested';
    new.requested_by := auth.uid();
    new.requested_at := coalesce(new.requested_at, now());
    new.scheduled_at := null;
    new.completed_at := null;
    new.result_notes := null;
    new.reviewed_by := null;
    new.target_level := null;
    new.promotion_applied_at := null;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (
    user_id,
    full_name,
    email,
    role
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'client'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.has_active_membership()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select exists (
  select 1
  from public.memberships
  where user_id = auth.uid()
    and status = 'active'
    and (start_date is null or start_date <= current_date)
    and (end_date is null or end_date >= current_date)
);
$function$

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select exists (
  select 1
  from public.profiles
  where user_id = auth.uid()
    and role in ('admin', 'super_admin')
);
$function$

CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select enabled from public.feature_flags where code = p_code), false);
$function$

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select exists (
  select 1
  from public.profiles
  where user_id = auth.uid()
    and role = 'super_admin'
);
$function$

CREATE OR REPLACE FUNCTION public.is_ucapsa_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin', 'super_admin')
  );
$function$

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- Permite cambios desde SQL Editor / service role.
  -- Esto sirve para crear el primer super_admin manualmente.
  if auth.uid() is null then
    return new;
  end if;

  -- Nadie puede cambiar el user_id del perfil.
  if old.user_id is distinct from new.user_id then
    raise exception 'No puedes cambiar el user_id del perfil.';
  end if;

  -- Un usuario normal no debe cambiar el email guardado en profiles.
  if old.email is distinct from new.email and not public.is_admin() then
    raise exception 'No puedes cambiar el email del perfil.';
  end if;

  -- Si cambia el rol, debe hacerlo admin o super_admin.
  if old.role is distinct from new.role then
    if not public.is_admin() then
      raise exception 'No tienes permiso para cambiar roles.';
    end if;

    -- Solo super_admin puede crear o modificar admins/super_admins.
    if (
      old.role in ('admin', 'super_admin')
      or new.role in ('admin', 'super_admin')
    ) and not public.is_super_admin() then
      raise exception 'Solo super_admin puede modificar roles administrativos.';
    end if;
  end if;

  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.program_schedule_occurs_on_date(p_schedule_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_schedule record;
  v_diff_weeks integer;
begin
  select * into v_schedule
  from public.get_effective_program_schedule(p_schedule_id, p_date);

  if not found or not coalesce(v_schedule.is_active, false) then
    return false;
  end if;

  if extract(dow from p_date)::int <> v_schedule.day_of_week then
    return false;
  end if;

  if v_schedule.repeat_type = 'biweekly' then
    if v_schedule.cycle_start_date is null or p_date < v_schedule.cycle_start_date then
      return false;
    end if;
    v_diff_weeks := floor((p_date - v_schedule.cycle_start_date)::numeric / 7)::int;
    if mod(v_diff_weeks, 2) <> 0 then
      return false;
    end if;
  end if;

  return true;
end;
$function$

CREATE OR REPLACE FUNCTION public.refresh_program_enrollment_progress(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_program_id uuid;
  v_required integer;
  v_count integer;
  v_latest date;
  v_schedule_count integer;
  v_target_offset integer;
  v_next_schedule_id uuid;
begin
  select e.program_id, p.required_attendances
    into v_program_id, v_required
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id
  where e.id = p_enrollment_id;

  if v_program_id is null then
    return;
  end if;

  select count(*)::int, max(attendance_date)
    into v_count, v_latest
  from public.program_attendances
  where enrollment_id = p_enrollment_id;

  select count(*)::int
    into v_schedule_count
  from public.program_schedules s
  join lateral public.get_effective_program_schedule(s.id, (clock_timestamp() at time zone 'America/Mexico_City')::date) e on true
  where s.program_id = v_program_id
    and e.is_active = true;

  if v_schedule_count > 0 then
    v_target_offset := least(v_count, v_schedule_count - 1);

    select s.id
      into v_next_schedule_id
    from public.program_schedules s
    join lateral public.get_effective_program_schedule(s.id, (clock_timestamp() at time zone 'America/Mexico_City')::date) e on true
    where s.program_id = v_program_id
      and e.is_active = true
    order by e.sequence_order, e.day_of_week, e.start_time
    offset v_target_offset
    limit 1;
  end if;

  update public.program_enrollments
  set attendances_count = v_count,
      last_attendance_at = v_latest,
      schedule_id = coalesce(v_next_schedule_id, schedule_id),
      requirements_met_at = case
        when v_count >= greatest(1, v_required) then coalesce(requirements_met_at, now())
        else null
      end,
      updated_at = now()
  where id = p_enrollment_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_member_visit_admin(p_user_id uuid, p_visited_at timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_membership public.memberships%rowtype;
  v_visit_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden registrar visitas.'; end if;

  select * into v_membership
  from public.memberships
  where user_id = p_user_id
    and status = 'active'
  order by created_at desc
  limit 1;
  if not found then raise exception 'El usuario no tiene una membresia activa.'; end if;

  insert into public.member_visits (user_id, membership_id, visited_at, visit_date, source, recorded_by, notes)
  values (
    p_user_id,
    v_membership.id,
    coalesce(p_visited_at, now()),
    (coalesce(p_visited_at, now()) at time zone 'America/Mexico_City')::date,
    'admin_manual',
    auth.uid(),
    nullif(btrim(p_notes), '')
  ) returning id into v_visit_id;
  return v_visit_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_member_visit_from_qr(p_qr_token text)
 RETURNS TABLE(visit_id uuid, result text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships%rowtype;
  v_visit_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    return query select null::uuid, 'not_authenticated'::text, 'No hay sesion activa.'::text;
    return;
  end if;

  if not exists (
    select 1 from public.attendance_qr_codes q
    where q.program_code = 'member'
      and q.token::text = btrim(p_qr_token)
      and q.is_active = true
  ) then
    return query select null::uuid, 'invalid_qr'::text, 'QR de Socios UCAPSA no valido.'::text;
    return;
  end if;

  select * into v_membership
  from public.memberships
  where user_id = v_user_id
    and status = 'active'
  order by created_at desc
  limit 1;

  if not found then
    return query select null::uuid, 'membership_not_active'::text, 'Tu membresia no esta activa.'::text;
    return;
  end if;

  insert into public.member_visits (
    user_id, membership_id, visited_at, visit_date, source, recorded_by, notes
  ) values (
    v_user_id,
    v_membership.id,
    v_now,
    (v_now at time zone 'America/Mexico_City')::date,
    'qr_member',
    v_user_id,
    null
  ) returning id into v_visit_id;

  return query select v_visit_id, 'registered'::text, 'Visita de socio registrada.'::text;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_my_practice_session(p_client_event_id uuid, p_enrollment_id uuid, p_started_at timestamp with time zone, p_completed_at timestamp with time zone, p_difficulty text, p_note text DEFAULT NULL::text, p_duration_seconds integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.program_enrollments%rowtype;
  v_existing_id uuid;
  v_practice_id uuid;
begin
  if v_user_id is null then
    raise exception 'No hay sesión activa.';
  end if;
  if p_client_event_id is null then
    raise exception 'Falta el identificador de la práctica.';
  end if;
  if p_enrollment_id is null then
    raise exception 'Falta la inscripción de la práctica.';
  end if;
  if p_difficulty not in ('easy', 'good', 'hard') then
    raise exception 'La dificultad de la práctica no es válida.';
  end if;
  if p_started_at is null or p_completed_at is null or p_completed_at < p_started_at then
    raise exception 'Las horas de la práctica no son válidas.';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'La duración de la práctica no es válida.';
  end if;

  select ps.id into v_existing_id
  from public.practice_sessions ps
  where ps.user_id = v_user_id
    and ps.client_event_id = p_client_event_id
  limit 1;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select * into v_enrollment
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.user_id = v_user_id
    and e.status = 'active'
  limit 1;
  if not found then
    raise exception 'La inscripción ya no está activa o no pertenece a tu cuenta.';
  end if;

  begin
    insert into public.practice_sessions (
      user_id, dog_id, enrollment_id, client_event_id, started_at, completed_at, difficulty, note, duration_seconds
    ) values (
      v_user_id, v_enrollment.dog_id, v_enrollment.id, p_client_event_id, p_started_at, p_completed_at, p_difficulty,
      nullif(btrim(coalesce(p_note, '')), ''), p_duration_seconds
    ) returning id into v_practice_id;
  exception
    when unique_violation then
      select ps.id into v_practice_id
      from public.practice_sessions ps
      where ps.user_id = v_user_id
        and ps.client_event_id = p_client_event_id
      limit 1;
  end;

  if v_practice_id is null then
    raise exception 'No se pudo confirmar la práctica.';
  end if;
  return v_practice_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_program_attendance_admin(p_enrollment_id uuid, p_attendance_date date, p_schedule_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_schedule_id uuid;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden registrar asistencia manual.';
  end if;
  if p_attendance_date > (clock_timestamp() at time zone 'America/Mexico_City')::date then
    raise exception 'No se puede registrar asistencia en una fecha futura.';
  end if;

  select * into v_enrollment from public.program_enrollments where id = p_enrollment_id;
  if not found then raise exception 'Inscripcion no encontrada.'; end if;

  v_schedule_id := coalesce(p_schedule_id, v_enrollment.schedule_id);
  select * into v_schedule
  from public.get_effective_program_schedule(v_schedule_id, p_attendance_date)
  where program_id = v_enrollment.program_id;

  if not found then raise exception 'El horario no pertenece al programa o no existia en esa fecha.'; end if;
  if not public.program_schedule_occurs_on_date(v_schedule_id, p_attendance_date) then
    raise exception 'La fecha no corresponde al horario y ciclo configurados para esa fecha.';
  end if;
  if exists (
    select 1 from public.program_class_cancellations c
    where c.schedule_id = v_schedule_id and c.cancellation_date = p_attendance_date and c.restored_at is null
  ) then raise exception 'La clase de esa fecha esta cancelada.'; end if;

  select id into v_attendance_id
  from public.program_attendances
  where enrollment_id = p_enrollment_id and attendance_date = p_attendance_date
  order by created_at asc limit 1;
  if v_attendance_id is not null then return v_attendance_id; end if;

  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (v_schedule_id, p_attendance_date, v_schedule.start_time, auth.uid())
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id into v_session_id from public.program_sessions
    where schedule_id = v_schedule_id and session_date = p_attendance_date;
  end if;

  select id into v_attendance_id
  from public.program_attendances
  where session_id = v_session_id and enrollment_id = p_enrollment_id;
  if v_attendance_id is not null then return v_attendance_id; end if;

  insert into public.program_attendances (
    enrollment_id, attendance_date, session_id, source, marked_by, recorded_at, notes
  ) values (
    p_enrollment_id, p_attendance_date, v_session_id, 'admin_manual', auth.uid(), now(), nullif(btrim(p_notes), '')
  ) returning id into v_attendance_id;
  return v_attendance_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_program_attendance_from_qr(p_qr_token text, p_enrollment_id uuid)
 RETURNS TABLE(attendance_id uuid, session_id uuid, result text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_qr public.attendance_qr_codes%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_program_code text;
  v_now_local timestamp without time zone := clock_timestamp() at time zone 'America/Mexico_City';
  v_today date;
  v_class_start timestamp without time zone;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if v_user_id is null then
    raise exception 'No hay sesion activa.';
  end if;
  v_today := v_now_local::date;

  select * into v_qr
  from public.attendance_qr_codes
  where token::text = btrim(p_qr_token)
    and is_active = true;
  if not found then
    return query select null::uuid, null::uuid, 'invalid_qr'::text, 'QR UCAPSA no valido.'::text;
    return;
  end if;

  select * into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id
    and user_id = v_user_id;
  if not found then
    return query select null::uuid, null::uuid, 'not_owner'::text, 'La inscripcion no pertenece a tu cuenta.'::text;
    return;
  end if;
  if v_enrollment.status <> 'active' then
    return query select null::uuid, null::uuid, 'inactive_enrollment'::text, 'La inscripcion no esta activa.'::text;
    return;
  end if;
  if v_enrollment.card_started_on is null or v_enrollment.card_expires_on is null then
    return query select null::uuid, null::uuid, 'card_dates_missing'::text, 'La vigencia de la tarjeta necesita revision administrativa.'::text;
    return;
  end if;
  if v_today < v_enrollment.card_started_on or v_today > v_enrollment.card_expires_on then
    return query select null::uuid, null::uuid, 'card_not_valid'::text, 'La tarjeta no esta vigente.'::text;
    return;
  end if;

  select code into v_program_code
  from public.programs
  where id = v_enrollment.program_id
    and is_active = true;
  if v_program_code is null or v_program_code <> v_qr.program_code then
    return query select null::uuid, null::uuid, 'wrong_program'::text, 'Este QR no corresponde a tu programa activo.'::text;
    return;
  end if;

  select * into v_schedule
  from public.get_effective_program_schedule(v_enrollment.schedule_id, v_today)
  where program_id = v_enrollment.program_id;
  if not found or not coalesce(v_schedule.is_active, false) then
    return query select null::uuid, null::uuid, 'schedule_not_found'::text, 'No hay horario activo para esta inscripcion.'::text;
    return;
  end if;

  if not public.program_schedule_occurs_on_date(v_enrollment.schedule_id, v_today) then
    if extract(dow from v_today)::int <> v_schedule.day_of_week then
      return query select null::uuid, null::uuid, 'wrong_day'::text, 'Hoy no corresponde a esta clase.'::text;
    end if;
    return query select null::uuid, null::uuid, 'wrong_cycle'::text, 'Esta semana no corresponde a la clase.'::text;
    return;
  end if;

  if exists (
    select 1 from public.program_class_cancellations c
    where c.schedule_id = v_schedule.schedule_id
      and c.cancellation_date = v_today
      and c.restored_at is null
  ) then
    return query select null::uuid, null::uuid, 'cancelled'::text, 'La clase de hoy esta cancelada.'::text;
    return;
  end if;

  v_class_start := v_today::timestamp + v_schedule.start_time;
  if v_now_local < v_class_start - make_interval(mins => v_qr.window_before_minutes)
     or v_now_local > v_class_start + make_interval(mins => v_qr.window_after_minutes) then
    return query select null::uuid, null::uuid, 'outside_window'::text, 'El registro de asistencia no esta disponible en este horario.'::text;
    return;
  end if;

  select a.id into v_attendance_id
  from public.program_attendances a
  where a.enrollment_id = v_enrollment.id
    and a.attendance_date = v_today
  order by a.created_at asc
  limit 1;
  if v_attendance_id is not null then
    return query select v_attendance_id, null::uuid, 'already_registered'::text, 'Tu asistencia de hoy ya estaba registrada.'::text;
    return;
  end if;

  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (v_schedule.schedule_id, v_today, v_schedule.start_time, v_user_id)
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;
  if v_session_id is null then
    select id into v_session_id from public.program_sessions where schedule_id = v_schedule.schedule_id and session_date = v_today;
  end if;

  select a.id into v_attendance_id
  from public.program_attendances a
  where a.session_id = v_session_id
    and a.enrollment_id = v_enrollment.id;
  if v_attendance_id is not null then
    return query select v_attendance_id, v_session_id, 'already_registered'::text, 'Tu asistencia ya estaba registrada.'::text;
    return;
  end if;

  insert into public.program_attendances (
    enrollment_id, attendance_date, session_id, source, marked_by, recorded_at, notes
  ) values (
    v_enrollment.id, v_today, v_session_id, 'qr_client', v_user_id, now(), null
  ) returning id into v_attendance_id;
  return query select v_attendance_id, v_session_id, 'registered'::text, 'Asistencia registrada.'::text;
end;
$function$

