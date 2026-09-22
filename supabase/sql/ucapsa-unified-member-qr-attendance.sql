-- UCAPSA — un solo QR para clase + visita de socio
--
-- Mantiene las operaciones canónicas existentes y amplía sus reglas:
-- - una inscripción de membresía no necesita vigencia de tarjeta;
-- - el QR de Socios puede registrar la clase elegida por el cliente;
-- - un QR de Puppy/Comandos también registra la visita del socio;
-- - la visita QR es una sola por día aunque se escaneen varios QR;
-- - perros excluidos de la membresía no reciben crédito de visita/puntos de socio.

begin;

-- La promoción por estado quedó retirada: sólo una decisión explícita de Admin
-- puede crear la siguiente etapa.
drop trigger if exists trg_ucapsa_unlock_next_program_stage on public.program_enrollments;
drop trigger if exists trg_unlock_next_program_stage on public.program_enrollments;
drop trigger if exists trg_ucapsa_unlock_next_comandos_level on public.program_enrollments;

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
  v_membership public.memberships%rowtype;
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
  v_membership_qr boolean := false;
begin
  if v_user_id is null then
    raise exception 'No hay sesion activa.';
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

  if v_capture > v_server_now + interval '10 minutes' then
    return query select null::uuid, null::uuid, 'invalid_capture_time'::text, 'La hora de captura del dispositivo no es valida.'::text;
    return;
  end if;

  if v_capture < v_server_now - interval '7 days' then
    return query select null::uuid, null::uuid, 'offline_capture_too_old'::text, 'La captura offline tiene mas de 7 dias y necesita revision de UCAPSA.'::text;
    return;
  end if;

  v_capture_local := v_capture at time zone 'America/Mexico_City';
  v_today := v_capture_local::date;

  select * into v_qr
  from public.attendance_qr_codes
  where token::text = btrim(p_qr_token)
    and is_active = true;

  if not found then
    return query select null::uuid, null::uuid, 'invalid_qr'::text, 'QR de asistencia UCAPSA no valido.'::text;
    return;
  end if;

  v_membership_qr := v_qr.program_code = 'member';

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

  select code into v_program_code
  from public.programs
  where id = v_enrollment.program_id
    and is_active = true;

  if v_program_code is null then
    return query select null::uuid, null::uuid, 'program_not_active'::text, 'El programa ya no esta activo.'::text;
    return;
  end if;

  if not v_membership_qr and v_program_code <> v_qr.program_code then
    return query select null::uuid, null::uuid, 'wrong_program'::text, 'Este QR no corresponde a tu programa activo.'::text;
    return;
  end if;

  if v_membership_qr and not exists (
    select 1
    from public.memberships m
    where m.user_id = v_user_id
      and m.status = 'active'
      and (m.start_date is null or m.start_date <= v_today)
  ) then
    return query select null::uuid, null::uuid, 'membership_not_active'::text, 'El QR de Socios requiere una membresia activa.'::text;
    return;
  end if;

  if coalesce(v_enrollment.access_mode, 'card') = 'membership' then
    select * into v_membership
    from public.memberships m
    where m.id = v_enrollment.membership_id
      and m.user_id = v_user_id
      and m.status = 'active';

    if not found then
      return query select null::uuid, null::uuid, 'membership_not_active'::text, 'La membresia que da acceso a esta clase no esta activa.'::text;
      return;
    end if;

    if v_membership.start_date is not null and v_today < v_membership.start_date then
      return query select null::uuid, null::uuid, 'membership_not_started_at_capture'::text, 'La membresia aun no habia iniciado al momento de la captura.'::text;
      return;
    end if;

    if v_enrollment.dog_id is null or not exists (
      select 1
      from public.membership_dog_access a
      where a.membership_id = v_membership.id
        and a.dog_id = v_enrollment.dog_id
        and a.is_covered = true
    ) then
      return query select null::uuid, null::uuid, 'dog_not_covered'::text, 'Este perro no tiene acceso ilimitado de socio.'::text;
      return;
    end if;
  else
    if v_enrollment.card_started_on is null or v_enrollment.card_expires_on is null then
      return query select null::uuid, null::uuid, 'card_dates_missing'::text, 'La vigencia de la tarjeta necesita revision administrativa.'::text;
      return;
    end if;

    if v_today < v_enrollment.card_started_on or v_today > v_enrollment.card_expires_on then
      return query select null::uuid, null::uuid, 'card_not_valid'::text, 'La tarjeta no estaba vigente al momento de la captura.'::text;
      return;
    end if;
  end if;

  select * into v_schedule
  from public.get_effective_program_schedule(v_enrollment.schedule_id, v_today)
  where program_id = v_enrollment.program_id;

  if not found or not coalesce(v_schedule.is_active, false) then
    return query select null::uuid, null::uuid, 'schedule_not_found'::text, 'No habia horario activo para esta inscripcion.'::text;
    return;
  end if;

  if not public.program_schedule_occurs_on_date(v_enrollment.schedule_id, v_today) then
    if extract(dow from v_today)::int <> v_schedule.day_of_week then
      return query select null::uuid, null::uuid, 'wrong_day'::text, 'La captura no corresponde a un dia de esta clase.'::text;
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
        case
          when coalesce(v_enrollment.access_mode, 'card') = 'membership'
            then 'La captura fue fuera del horario habitual (%s a %s, clase %s). Puedes confirmarla; se registrara como asistencia de socio.'
          else 'La captura fue fuera del horario habitual (%s a %s, clase %s). Puedes confirmarla; consumira una asistencia.'
        end,
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
      when coalesce(v_enrollment.access_mode, 'card') = 'membership' then 'Asistencia de socio registrada.'
      else 'Asistencia registrada.'
    end::text;
end;
$$;

create or replace function public.register_member_visit_from_qr(
  p_qr_token text,
  p_client_event_id uuid,
  p_captured_at timestamptz
)
returns table(visit_id uuid, result text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships%rowtype;
  v_qr public.attendance_qr_codes%rowtype;
  v_visit_id uuid;
  v_server_now timestamptz := clock_timestamp();
  v_capture timestamptz := coalesce(p_captured_at, clock_timestamp());
  v_visit_date date := (coalesce(p_captured_at, clock_timestamp()) at time zone 'America/Mexico_City')::date;
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

  if v_capture > v_server_now + interval '10 minutes' then
    return query select null::uuid, 'invalid_capture_time'::text, 'La hora de captura del dispositivo no es valida.'::text;
    return;
  end if;

  if v_capture < v_server_now - interval '7 days' then
    return query select null::uuid, 'offline_capture_too_old'::text, 'La captura offline tiene mas de 7 dias y necesita revision de UCAPSA.'::text;
    return;
  end if;

  select * into v_qr
  from public.attendance_qr_codes q
  where q.token::text = btrim(p_qr_token)
    and q.program_code in ('member', 'puppy', 'comandos')
    and q.is_active = true;

  if not found then
    return query select null::uuid, 'invalid_qr'::text, 'QR oficial UCAPSA no valido.'::text;
    return;
  end if;

  select * into v_membership
  from public.memberships
  where user_id = v_user_id
    and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if not found then
    return query select null::uuid, 'membership_not_active'::text, 'Tu membresia no esta activa.'::text;
    return;
  end if;

  if v_membership.start_date is null then
    return query select null::uuid, 'membership_dates_missing'::text, 'La fecha de inicio de la membresia necesita revision administrativa.'::text;
    return;
  end if;

  if v_visit_date < v_membership.start_date then
    return query select null::uuid, 'membership_not_started_at_capture'::text, 'La membresia aun no habia iniciado al momento de la captura.'::text;
    return;
  end if;

  -- Un socio cuenta como una visita por día aunque escanee Socios y después
  -- Puppy/Comandos (o al revés).
  select mv.id into v_visit_id
  from public.member_visits mv
  where mv.user_id = v_user_id
    and mv.visit_date = v_visit_date
  order by mv.visited_at asc
  limit 1;

  if v_visit_id is not null then
    return query select v_visit_id, 'already_registered'::text, 'La visita de socio de hoy ya estaba registrada.'::text;
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
    v_capture,
    v_visit_date,
    case when v_qr.program_code = 'member' then 'qr_member' else 'qr_program' end,
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

-- Los wrappers instalados anteriormente siguen llamando la firma de 5/3 args,
-- por lo que no se duplican aquí. Sus grants existentes se conservan.

create or replace function public.ucapsa_snapshot_member_visit_dogs()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.member_visit_dogs (
    visit_id,
    dog_id,
    credit_source,
    credited_at,
    credited_by
  )
  select
    new.id,
    d.id,
    'auto',
    clock_timestamp(),
    new.recorded_by
  from public.dogs d
  join public.membership_dog_access a
    on a.dog_id = d.id
   and a.membership_id = new.membership_id
   and a.is_covered = true
  where d.user_id = new.user_id
    and d.is_active = true
  on conflict (visit_id, dog_id) do nothing;

  return new;
end;
$$;

revoke all on function public.ucapsa_snapshot_member_visit_dogs()
  from public, anon, authenticated;

create or replace function public.award_ucapsa_point_for_program_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_dog_id uuid;
  v_season_id uuid;
  v_participant_id uuid;
  v_points integer;
  v_attendance_ts timestamptz;
begin
  select e.user_id, e.dog_id
    into v_user_id, v_dog_id
  from public.program_enrollments e
  where e.id = new.enrollment_id;

  if v_user_id is null or v_dog_id is null then
    return new;
  end if;

  v_attendance_ts := coalesce(new.recorded_at, new.created_at, now());

  select s.id
    into v_season_id
  from public.ucapsa_points_seasons s
  where s.status = 'active'
    and v_attendance_ts >= s.starts_at
    and v_attendance_ts < s.ends_at
  order by s.starts_at desc
  limit 1;

  if v_season_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.memberships m
    join public.membership_dog_access a
      on a.membership_id = m.id
     and a.dog_id = v_dog_id
     and a.is_covered = true
    where m.user_id = v_user_id
      and m.status = 'active'
  ) then
    return new;
  end if;

  select r.default_points
    into v_points
  from public.ucapsa_points_rules r
  where r.season_id = v_season_id
    and r.code = 'class_attendance'
    and r.source_type = 'class_attendance'
    and r.is_active = true
  limit 1;

  if coalesce(v_points, 0) = 0 then
    return new;
  end if;

  v_participant_id := public.ensure_ucapsa_points_participant(v_user_id, v_dog_id);
  if v_participant_id is null then
    return new;
  end if;

  insert into public.ucapsa_points_ledger (
    season_id,
    participant_id,
    rule_code,
    source_type,
    source_id,
    dedupe_key,
    points,
    reason,
    awarded_by,
    occurred_at,
    metadata
  ) values (
    v_season_id,
    v_participant_id,
    'class_attendance',
    'class_attendance',
    new.id::text,
    'class_attendance:' || new.id::text,
    v_points,
    'Asistencia confirmada',
    new.marked_by,
    v_attendance_ts,
    jsonb_build_object(
      'enrollment_id', new.enrollment_id,
      'attendance_date', new.attendance_date,
      'source', new.source,
      'outside_window', new.outside_window
    )
  )
  on conflict (season_id, dedupe_key) do nothing;

  return new;
exception
  when others then
    raise warning 'UCAPSA points attendance award failed for attendance %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.award_ucapsa_point_for_program_attendance()
  from public, anon, authenticated;

commit;
