-- UCAPSA — Outbox e idempotencia para QR capturados offline
--
-- Objetivo: una asistencia o visita puede guardarse primero en el dispositivo
-- y reintentarse cuando vuelva la red sin duplicarse. Para clases se conserva la
-- hora real de captura (máximo 7 días) para validar el horario que el usuario
-- escaneó, no la hora posterior en la que volvió la conexión.
--
-- Membresía: status = 'active' significa socio. Pagos y end_date no revocan
-- automáticamente la membresía.

alter table public.member_visits
  add column if not exists client_event_id uuid;

create unique index if not exists member_visits_user_client_event_unique_idx
  on public.member_visits(user_id, client_event_id)
  where client_event_id is not null;

alter table public.program_attendances
  add column if not exists client_event_id uuid;

create unique index if not exists program_attendances_enrollment_client_event_unique_idx
  on public.program_attendances(enrollment_id, client_event_id)
  where client_event_id is not null;

create or replace function public.register_program_attendance_from_qr(
  p_qr_token text,
  p_enrollment_id uuid,
  p_confirm_outside_window boolean,
  p_client_event_id uuid,
  p_captured_at timestamptz
)
returns table(attendance_id uuid, session_id uuid, result text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_qr public.attendance_qr_codes%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_program_code text;
  v_server_now timestamptz := clock_timestamp();
  v_capture timestamptz := coalesce(p_captured_at, clock_timestamp());
  v_capture_local timestamp without time zone;
  v_today date;
  v_class_start timestamp without time zone;
  v_outside_window boolean := false;
  v_window_start timestamp without time zone;
  v_window_end timestamp without time zone;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if v_user_id is null then
    raise exception 'No hay sesion activa.';
  end if;

  if v_capture > v_server_now + interval '10 minutes' then
    return query select null::uuid, null::uuid, 'invalid_capture_time'::text, 'La hora de captura del dispositivo no es valida.'::text;
    return;
  end if;

  if v_capture < v_server_now - interval '7 days' then
    return query select null::uuid, null::uuid, 'offline_capture_too_old'::text, 'La captura offline tiene mas de 7 dias y necesita revision de UCAPSA.'::text;
    return;
  end if;

  if p_client_event_id is not null then
    select a.id, a.session_id
      into v_attendance_id, v_session_id
    from public.program_attendances a
    where a.enrollment_id = p_enrollment_id
      and a.client_event_id = p_client_event_id
    limit 1;

    if v_attendance_id is not null then
      return query select v_attendance_id, v_session_id, 'already_registered'::text, 'Tu asistencia ya estaba registrada.'::text;
      return;
    end if;
  end if;

  v_capture_local := v_capture at time zone 'America/Mexico_City';
  v_today := v_capture_local::date;

  select * into v_qr
  from public.attendance_qr_codes
  where token::text = btrim(p_qr_token)
    and is_active = true;

  if not found or v_qr.program_code = 'member' then
    return query select null::uuid, null::uuid, 'invalid_qr'::text, 'QR de asistencia UCAPSA no valido.'::text;
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
    return query select null::uuid, null::uuid, 'card_not_valid'::text, 'La tarjeta no estaba vigente al momento de la captura.'::text;
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
    return query select null::uuid, null::uuid, 'schedule_not_found'::text, 'No había horario activo para esta inscripción.'::text;
    return;
  end if;

  if not public.program_schedule_occurs_on_date(v_enrollment.schedule_id, v_today) then
    if extract(dow from v_today)::int <> v_schedule.day_of_week then
      return query select null::uuid, null::uuid, 'wrong_day'::text, 'La captura no corresponde a un día de esta clase.'::text;
      return;
    end if;
    return query select null::uuid, null::uuid, 'wrong_cycle'::text, 'La captura no corresponde al ciclo de esta clase.'::text;
    return;
  end if;

  if exists (
    select 1
    from public.program_class_cancellations c
    where c.schedule_id = v_schedule.schedule_id
      and c.cancellation_date = v_today
      and c.restored_at is null
  ) then
    return query select null::uuid, null::uuid, 'cancelled'::text, 'La clase de esa fecha estaba cancelada.'::text;
    return;
  end if;

  select a.id, a.session_id
    into v_attendance_id, v_session_id
  from public.program_attendances a
  where a.enrollment_id = v_enrollment.id
    and a.attendance_date = v_today
  order by a.created_at asc
  limit 1;

  if v_attendance_id is not null then
    return query select v_attendance_id, v_session_id, 'already_registered'::text, 'Tu asistencia de esa fecha ya estaba registrada.'::text;
    return;
  end if;

  v_class_start := v_today::timestamp + v_schedule.start_time;
  v_window_start := v_class_start - make_interval(mins => v_qr.window_before_minutes);
  v_window_end := v_class_start + make_interval(mins => v_qr.window_after_minutes);
  v_outside_window := v_capture_local < v_window_start or v_capture_local > v_window_end;

  if v_outside_window and not coalesce(p_confirm_outside_window, false) then
    return query select
      null::uuid,
      null::uuid,
      'outside_window_confirmation_required'::text,
      format(
        'La captura fue fuera del horario habitual (%s a %s, clase %s). Puedes confirmarla; consumirá una asistencia.',
        to_char(v_window_start, 'HH24:MI'),
        to_char(v_window_end, 'HH24:MI'),
        to_char(v_class_start, 'HH24:MI')
      )::text;
    return;
  end if;

  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (v_schedule.schedule_id, v_today, v_schedule.start_time, v_user_id)
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id into v_session_id
    from public.program_sessions
    where schedule_id = v_schedule.schedule_id
      and session_date = v_today;
  end if;

  insert into public.program_attendances (
    enrollment_id,
    attendance_date,
    session_id,
    source,
    marked_by,
    recorded_at,
    notes,
    outside_window,
    client_event_id
  ) values (
    v_enrollment.id,
    v_today,
    v_session_id,
    'qr_client',
    v_user_id,
    v_capture,
    null,
    v_outside_window,
    p_client_event_id
  )
  on conflict (enrollment_id, attendance_date) do nothing
  returning id into v_attendance_id;

  if v_attendance_id is null then
    select a.id, a.session_id
      into v_attendance_id, v_session_id
    from public.program_attendances a
    where a.enrollment_id = v_enrollment.id
      and a.attendance_date = v_today
    order by a.created_at asc
    limit 1;
    return query select v_attendance_id, v_session_id, 'already_registered'::text, 'Tu asistencia de esa fecha ya estaba registrada.'::text;
    return;
  end if;

  return query select
    v_attendance_id,
    v_session_id,
    'registered'::text,
    case
      when v_outside_window then 'Asistencia registrada fuera del horario habitual.'
      else 'Asistencia registrada.'
    end::text;
end;
$$;

-- Compatibilidad con clientes instalados que aún llaman las firmas anteriores.
create or replace function public.register_program_attendance_from_qr(
  p_qr_token text,
  p_enrollment_id uuid,
  p_confirm_outside_window boolean
)
returns table(attendance_id uuid, session_id uuid, result text, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.register_program_attendance_from_qr(
    p_qr_token,
    p_enrollment_id,
    p_confirm_outside_window,
    null::uuid,
    clock_timestamp()
  );
$$;

create or replace function public.register_program_attendance_from_qr(
  p_qr_token text,
  p_enrollment_id uuid
)
returns table(attendance_id uuid, session_id uuid, result text, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.register_program_attendance_from_qr(
    p_qr_token,
    p_enrollment_id,
    false,
    null::uuid,
    clock_timestamp()
  );
$$;

create or replace function public.register_member_visit_from_qr(
  p_qr_token text,
  p_client_event_id uuid
)
returns table(visit_id uuid, result text, message text)
language plpgsql
security definer
set search_path = public
as $$
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

  if p_client_event_id is not null then
    select mv.id into v_visit_id
    from public.member_visits mv
    where mv.user_id = v_user_id
      and mv.client_event_id = p_client_event_id
    limit 1;

    if v_visit_id is not null then
      return query select v_visit_id, 'already_registered'::text, 'La visita ya estaba registrada.'::text;
      return;
    end if;
  end if;

  if not exists (
    select 1
    from public.attendance_qr_codes q
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
    user_id,
    membership_id,
    visited_at,
    visit_date,
    source,
    recorded_by,
    notes,
    client_event_id
  ) values (
    v_user_id,
    v_membership.id,
    v_now,
    (v_now at time zone 'America/Mexico_City')::date,
    'qr_member',
    v_user_id,
    null,
    p_client_event_id
  )
  on conflict (user_id, client_event_id) where client_event_id is not null
  do nothing
  returning id into v_visit_id;

  if v_visit_id is null and p_client_event_id is not null then
    select mv.id into v_visit_id
    from public.member_visits mv
    where mv.user_id = v_user_id
      and mv.client_event_id = p_client_event_id
    limit 1;
    return query select v_visit_id, 'already_registered'::text, 'La visita ya estaba registrada.'::text;
    return;
  end if;

  return query select v_visit_id, 'registered'::text, 'Visita de socio registrada.'::text;
end;
$$;

create or replace function public.register_member_visit_from_qr(p_qr_token text)
returns table(visit_id uuid, result text, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.register_member_visit_from_qr(p_qr_token, null::uuid);
$$;

grant execute on function public.register_program_attendance_from_qr(text, uuid, boolean, uuid, timestamptz) to authenticated;
grant execute on function public.register_program_attendance_from_qr(text, uuid, boolean) to authenticated;
grant execute on function public.register_program_attendance_from_qr(text, uuid) to authenticated;
grant execute on function public.register_member_visit_from_qr(text, uuid) to authenticated;
grant execute on function public.register_member_visit_from_qr(text) to authenticated;
