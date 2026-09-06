-- UCAPSA cambio 4.1
-- Registro historico de asistencia por QR para clientes.
--
-- Objetivo:
-- - permitir que un cliente conserve una foto del QR oficial y, despues,
--   seleccione una clase pasada valida para registrar su asistencia;
-- - mantener toda la validacion sensible en Supabase;
-- - no permitir fechas futuras, clases canceladas, duplicados ni fechas fuera
--   de la vigencia de la tarjeta;
-- - derivar el horario esperado segun las asistencias reales anteriores, en
--   vez de confiar en un horario enviado por el cliente.

begin;

create or replace function public.get_my_program_attendance_backfill_candidate(
  p_enrollment_id uuid,
  p_attendance_date date
)
returns table(
  schedule_id uuid,
  program_code text,
  program_name text,
  schedule_name text,
  scheduled_start_time time without time zone
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
  v_enrollment public.program_enrollments%rowtype;
  v_prior_count integer := 0;
  v_schedule_count integer := 0;
  v_target_offset integer := 0;
  v_schedule record;
begin
  if v_user_id is null or p_enrollment_id is null or p_attendance_date is null then
    return;
  end if;

  -- Esta RPC es exclusivamente para backfill. Hoy sigue usando la RPC normal,
  -- que conserva la ventana horaria y su confirmacion explicita.
  if p_attendance_date >= v_today then
    return;
  end if;

  select e.*
    into v_enrollment
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.user_id = v_user_id;

  if not found or v_enrollment.status <> 'active' then
    return;
  end if;

  -- Sin vigencia comprobable no se permite fabricar contexto historico.
  if v_enrollment.card_started_on is null
     or v_enrollment.card_expires_on is null
     or p_attendance_date < v_enrollment.card_started_on
     or p_attendance_date > v_enrollment.card_expires_on
     or (v_enrollment.started_at is not null and p_attendance_date < v_enrollment.started_at) then
    return;
  end if;

  if exists (
    select 1
    from public.program_attendances a
    where a.enrollment_id = v_enrollment.id
      and a.attendance_date = p_attendance_date
  ) then
    return;
  end if;

  -- El paso esperado se deriva de asistencias reales anteriores a la fecha.
  select count(*)::int
    into v_prior_count
  from public.program_attendances a
  where a.enrollment_id = v_enrollment.id
    and a.attendance_date < p_attendance_date;

  select count(*)::int
    into v_schedule_count
  from public.program_schedules s
  cross join lateral public.get_effective_program_schedule(s.id, p_attendance_date) eff
  where s.program_id = v_enrollment.program_id
    and eff.is_active = true;

  if v_schedule_count <= 0 then
    return;
  end if;

  v_target_offset := least(v_prior_count, v_schedule_count - 1);

  select eff.*
    into v_schedule
  from public.program_schedules s
  cross join lateral public.get_effective_program_schedule(s.id, p_attendance_date) eff
  where s.program_id = v_enrollment.program_id
    and eff.is_active = true
  order by eff.sequence_order, eff.day_of_week, eff.start_time, eff.schedule_id
  offset v_target_offset
  limit 1;

  if not found then
    return;
  end if;

  if not public.program_schedule_occurs_on_date(v_schedule.schedule_id, p_attendance_date) then
    return;
  end if;

  if exists (
    select 1
    from public.program_class_cancellations c
    where c.schedule_id = v_schedule.schedule_id
      and c.cancellation_date = p_attendance_date
      and c.restored_at is null
  ) then
    return;
  end if;

  return query
  select
    v_schedule.schedule_id,
    p.code,
    p.name,
    v_schedule.name,
    v_schedule.start_time
  from public.programs p
  where p.id = v_enrollment.program_id
    and p.is_active = true;
end;
$function$;

revoke all on function public.get_my_program_attendance_backfill_candidate(uuid, date) from public, anon;
grant execute on function public.get_my_program_attendance_backfill_candidate(uuid, date) to authenticated;

create or replace function public.get_my_program_attendance_backfill_dates(
  p_enrollment_id uuid,
  p_limit integer default 12
)
returns table(
  attendance_date date,
  schedule_id uuid,
  program_code text,
  program_name text,
  schedule_name text,
  scheduled_start_time time without time zone
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
  v_date date := v_today - 1;
  v_floor date := v_today - 365;
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 20));
  v_returned integer := 0;
  v_candidate record;
begin
  if auth.uid() is null or p_enrollment_id is null then
    return;
  end if;

  while v_date >= v_floor and v_returned < v_limit loop
    select c.*
      into v_candidate
    from public.get_my_program_attendance_backfill_candidate(p_enrollment_id, v_date) c;

    if found then
      return query
      select
        v_date,
        v_candidate.schedule_id,
        v_candidate.program_code,
        v_candidate.program_name,
        v_candidate.schedule_name,
        v_candidate.scheduled_start_time;
      v_returned := v_returned + 1;
    end if;

    v_date := v_date - 1;
  end loop;
end;
$function$;

revoke all on function public.get_my_program_attendance_backfill_dates(uuid, integer) from public, anon;
grant execute on function public.get_my_program_attendance_backfill_dates(uuid, integer) to authenticated;

create or replace function public.register_program_attendance_from_qr_for_date(
  p_qr_token text,
  p_enrollment_id uuid,
  p_attendance_date date
)
returns table(
  attendance_id uuid,
  session_id uuid,
  result text,
  message text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
  v_qr public.attendance_qr_codes%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_program_code text;
  v_candidate record;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if v_user_id is null then
    raise exception 'No hay sesion activa.';
  end if;

  if p_attendance_date is null or p_attendance_date >= v_today then
    return query
    select null::uuid, null::uuid, 'invalid_historical_date'::text,
      'Selecciona una fecha anterior a hoy.'::text;
    return;
  end if;

  select q.*
    into v_qr
  from public.attendance_qr_codes q
  where q.token::text = btrim(coalesce(p_qr_token, ''))
    and q.is_active = true
    and q.program_code <> 'member';

  if not found then
    return query
    select null::uuid, null::uuid, 'invalid_qr'::text,
      'QR de asistencia UCAPSA no valido.'::text;
    return;
  end if;

  select e.*
    into v_enrollment
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.user_id = v_user_id;

  if not found then
    return query
    select null::uuid, null::uuid, 'not_owner'::text,
      'La inscripcion no pertenece a tu cuenta.'::text;
    return;
  end if;

  if v_enrollment.status <> 'active' then
    return query
    select null::uuid, null::uuid, 'inactive_enrollment'::text,
      'La inscripcion no esta activa.'::text;
    return;
  end if;

  select p.code
    into v_program_code
  from public.programs p
  where p.id = v_enrollment.program_id
    and p.is_active = true;

  if v_program_code is null or v_program_code <> v_qr.program_code then
    return query
    select null::uuid, null::uuid, 'wrong_program'::text,
      'Este QR no corresponde a tu programa activo.'::text;
    return;
  end if;

  select a.id
    into v_attendance_id
  from public.program_attendances a
  where a.enrollment_id = v_enrollment.id
    and a.attendance_date = p_attendance_date
  order by a.created_at
  limit 1;

  if v_attendance_id is not null then
    return query
    select v_attendance_id, null::uuid, 'already_registered'::text,
      'Esa asistencia ya estaba registrada.'::text;
    return;
  end if;

  select c.*
    into v_candidate
  from public.get_my_program_attendance_backfill_candidate(v_enrollment.id, p_attendance_date) c;

  if not found then
    return query
    select null::uuid, null::uuid, 'historical_date_not_available'::text,
      'Esa fecha no corresponde a una clase historica disponible para tu inscripcion.'::text;
    return;
  end if;

  insert into public.program_sessions (
    schedule_id,
    session_date,
    scheduled_start_time,
    created_by
  ) values (
    v_candidate.schedule_id,
    p_attendance_date,
    v_candidate.scheduled_start_time,
    v_user_id
  )
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select ps.id
      into v_session_id
    from public.program_sessions ps
    where ps.schedule_id = v_candidate.schedule_id
      and ps.session_date = p_attendance_date;
  end if;

  begin
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
      'qr_client',
      v_user_id,
      now(),
      null,
      true
    )
    returning id into v_attendance_id;
  exception
    when unique_violation then
      select a.id
        into v_attendance_id
      from public.program_attendances a
      where a.enrollment_id = v_enrollment.id
        and a.attendance_date = p_attendance_date
      order by a.created_at
      limit 1;

      return query
      select v_attendance_id, v_session_id, 'already_registered'::text,
        'Esa asistencia ya estaba registrada.'::text;
      return;
  end;

  return query
  select
    v_attendance_id,
    v_session_id,
    'registered'::text,
    format('Asistencia del %s registrada.', to_char(p_attendance_date, 'DD/MM/YYYY'))::text;
end;
$function$;

revoke all on function public.register_program_attendance_from_qr_for_date(text, uuid, date) from public, anon;
grant execute on function public.register_program_attendance_from_qr_for_date(text, uuid, date) to authenticated;

commit;
