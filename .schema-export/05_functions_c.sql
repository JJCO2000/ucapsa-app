CREATE OR REPLACE FUNCTION public.register_program_attendance_from_qr(p_qr_token text, p_enrollment_id uuid, p_confirm_outside_window boolean)
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
  v_outside_window boolean := false;
  v_window_start timestamp without time zone;
  v_window_end timestamp without time zone;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if v_user_id is null then raise exception 'No hay sesion activa.'; end if;
  v_today := v_now_local::date;
  select * into v_qr from public.attendance_qr_codes where token::text = btrim(p_qr_token) and is_active = true;
  if not found or v_qr.program_code = 'member' then return query select null::uuid, null::uuid, 'invalid_qr'::text, 'QR de asistencia UCAPSA no valido.'::text; return; end if;
  select * into v_enrollment from public.program_enrollments where id = p_enrollment_id and user_id = v_user_id;
  if not found then return query select null::uuid, null::uuid, 'not_owner'::text, 'La inscripcion no pertenece a tu cuenta.'::text; return; end if;
  if v_enrollment.status <> 'active' then return query select null::uuid, null::uuid, 'inactive_enrollment'::text, 'La inscripcion no esta activa.'::text; return; end if;
  if v_enrollment.card_started_on is null or v_enrollment.card_expires_on is null then return query select null::uuid, null::uuid, 'card_dates_missing'::text, 'La vigencia de la tarjeta necesita revision administrativa.'::text; return; end if;
  if v_today < v_enrollment.card_started_on or v_today > v_enrollment.card_expires_on then return query select null::uuid, null::uuid, 'card_not_valid'::text, 'La tarjeta no esta vigente.'::text; return; end if;
  select code into v_program_code from public.programs where id = v_enrollment.program_id and is_active = true;
  if v_program_code is null or v_program_code <> v_qr.program_code then return query select null::uuid, null::uuid, 'wrong_program'::text, 'Este QR no corresponde a tu programa activo.'::text; return; end if;
  select * into v_schedule from public.get_effective_program_schedule(v_enrollment.schedule_id, v_today) where program_id = v_enrollment.program_id;
  if not found or not coalesce(v_schedule.is_active, false) then return query select null::uuid, null::uuid, 'schedule_not_found'::text, 'No hay horario activo para esta inscripcion.'::text; return; end if;
  if not public.program_schedule_occurs_on_date(v_enrollment.schedule_id, v_today) then
    if extract(dow from v_today)::int <> v_schedule.day_of_week then return query select null::uuid, null::uuid, 'wrong_day'::text, 'Hoy no corresponde a esta clase.'::text; return; end if;
    return query select null::uuid, null::uuid, 'wrong_cycle'::text, 'Esta semana no corresponde a la clase.'::text; return;
  end if;
  if exists (select 1 from public.program_class_cancellations c where c.schedule_id = v_schedule.schedule_id and c.cancellation_date = v_today and c.restored_at is null) then return query select null::uuid, null::uuid, 'cancelled'::text, 'La clase de hoy esta cancelada.'::text; return; end if;
  select a.id into v_attendance_id from public.program_attendances a where a.enrollment_id = v_enrollment.id and a.attendance_date = v_today order by a.created_at asc limit 1;
  if v_attendance_id is not null then return query select v_attendance_id, null::uuid, 'already_registered'::text, 'Tu asistencia de hoy ya estaba registrada.'::text; return; end if;
  v_class_start := v_today::timestamp + v_schedule.start_time;
  v_window_start := v_class_start - make_interval(mins => v_qr.window_before_minutes);
  v_window_end := v_class_start + make_interval(mins => v_qr.window_after_minutes);
  v_outside_window := v_now_local < v_window_start or v_now_local > v_window_end;
  if v_outside_window and not coalesce(p_confirm_outside_window, false) then
    return query select null::uuid, null::uuid, 'outside_window_confirmation_required'::text,
      format('El horario habitual era de %s a %s para la clase de %s. Puedes registrarla de todos modos; consumira una asistencia.', to_char(v_window_start, 'HH24:MI'), to_char(v_window_end, 'HH24:MI'), to_char(v_class_start, 'HH24:MI'))::text;
    return;
  end if;
  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (v_schedule.schedule_id, v_today, v_schedule.start_time, v_user_id)
  on conflict (schedule_id, session_date) do nothing returning id into v_session_id;
  if v_session_id is null then select id into v_session_id from public.program_sessions where schedule_id = v_schedule.schedule_id and session_date = v_today; end if;
  select a.id into v_attendance_id from public.program_attendances a where a.session_id = v_session_id and a.enrollment_id = v_enrollment.id;
  if v_attendance_id is not null then return query select v_attendance_id, v_session_id, 'already_registered'::text, 'Tu asistencia ya estaba registrada.'::text; return; end if;
  insert into public.program_attendances (enrollment_id, attendance_date, session_id, source, marked_by, recorded_at, notes, outside_window)
  values (v_enrollment.id, v_today, v_session_id, 'qr_client', v_user_id, now(), null, v_outside_window) returning id into v_attendance_id;
  return query select v_attendance_id, v_session_id, 'registered'::text, case when v_outside_window then 'Asistencia registrada fuera del horario habitual.' else 'Asistencia registrada.' end::text;
end;
$function$

CREATE OR REPLACE FUNCTION public.rename_my_basic_dog(p_dog_id uuid, p_name text)
 RETURNS TABLE(id uuid, name text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_old_name text;
  v_dog public.dogs%rowtype;
begin
  if v_user_id is null then raise exception 'No hay sesion activa.'; end if;
  if p_dog_id is null then raise exception 'No se encontro el perro.'; end if;
  if v_name = '' then raise exception 'Escribe el nombre de tu perro.'; end if;
  if length(v_name) > 80 then raise exception 'El nombre es demasiado largo.'; end if;
  if v_name ~ '[[:cntrl:]]' then raise exception 'El nombre contiene caracteres no permitidos.'; end if;
  select d.name into v_old_name from public.dogs d where d.id = p_dog_id and d.user_id = v_user_id and d.is_active;
  if not found then raise exception 'No se encontro el perro en tu cuenta.'; end if;
  if exists (select 1 from public.dogs d where d.user_id = v_user_id and d.is_active and d.id <> p_dog_id and lower(btrim(d.name)) = lower(v_name)) then raise exception 'Ya tienes otro perro activo con ese nombre.'; end if;
  update public.dogs d set name = v_name, updated_at = now() where d.id = p_dog_id and d.user_id = v_user_id returning d.* into v_dog;
  update public.program_enrollments e set dog_name = v_name, updated_at = now() where e.user_id = v_user_id and e.dog_id = p_dog_id;
  update public.profiles p set dog_name = v_name, updated_at = now() where p.user_id = v_user_id and lower(btrim(coalesce(p.dog_name, ''))) = lower(btrim(v_old_name));
  return query select v_dog.id, v_dog.name, v_dog.is_active, v_dog.created_at, v_dog.updated_at;
end;
$function$

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$function$

CREATE OR REPLACE FUNCTION public.rotate_attendance_qr_code(p_program_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token uuid;
begin
  if not public.is_super_admin() then raise exception 'Solo super_admin puede reemplazar un QR oficial.'; end if;
  if p_program_code not in ('puppy','comandos','member') then raise exception 'Programa QR no valido.'; end if;
  update public.attendance_qr_codes
  set token = gen_random_uuid(), version = version + 1, rotated_at = now(), updated_at = now(), updated_by = auth.uid()
  where program_code = p_program_code returning token into v_token;
  if v_token is null then raise exception 'QR oficial no encontrado.'; end if;
  return v_token;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_config_updated_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_program_enrollment_card_validity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' and new.card_started_on is null then
    new.card_started_on := coalesce(new.started_at::date, current_date);
  elsif tg_op = 'UPDATE' and new.card_started_on is null and new.started_at is not null then
    new.card_started_on := new.started_at::date;
  end if;
  if new.card_expires_on is null and new.card_started_on is not null then new.card_expires_on := (new.card_started_on + interval '1 year')::date; end if;
  if new.card_started_on is not null and new.card_expires_on is not null and new.card_expires_on < new.card_started_on then raise exception 'La fecha de vencimiento no puede ser anterior al inicio de la tarjeta.'; end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email, updated_at = now() where user_id = new.id;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.sync_program_enrollment_dog_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.name is distinct from old.name then
    update public.program_enrollments set dog_name = new.name, updated_at = now() where dog_id = new.id;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.trg_refresh_program_enrollment_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_program_enrollment_progress(old.enrollment_id);
    return old;
  end if;
  perform public.refresh_program_enrollment_progress(new.enrollment_id);
  if tg_op = 'UPDATE' and old.enrollment_id is distinct from new.enrollment_id then perform public.refresh_program_enrollment_progress(old.enrollment_id); end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.ucapsa_achievement_code_for_enrollment(p_enrollment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_program_code text;
  v_program_level text;
begin
  select p.code, e.program_level into v_program_code, v_program_level
  from public.program_enrollments e join public.programs p on p.id = e.program_id where e.id = p_enrollment_id;
  if v_program_code = 'puppy' then return 'puppy_completed'; end if;
  if v_program_code = 'comandos' then
    if v_program_level in ('base', 'principiante') then return 'comandos_basico_completed';
    elsif v_program_level = 'medio' then return 'comandos_medio_completed';
    elsif v_program_level = 'avanzado' then return 'comandos_avanzado_completed';
    end if;
  end if;
  return null;
end;
$function$

CREATE OR REPLACE FUNCTION public.ucapsa_award_program_achievement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    v_code := public.ucapsa_achievement_code_for_enrollment(new.id);
    if v_code is not null then
      insert into public.user_achievements (user_id, achievement_code, source_type, source_id, awarded_by)
      values (new.user_id, v_code, 'program_enrollment', new.id, auth.uid())
      on conflict (user_id, achievement_code) do nothing;
    end if;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.upsert_notification_token(p_expo_push_token text, p_platform text DEFAULT 'unknown'::text, p_device_name text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_app_ownership text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text, p_project_id text DEFAULT NULL::text)
 RETURNS notification_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_row public.notification_tokens;
  v_platform text := coalesce(nullif(trim(p_platform), ''), 'unknown');
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if nullif(trim(p_expo_push_token), '') is null then raise exception 'Expo push token requerido'; end if;
  if v_platform not in ('ios', 'android', 'web', 'unknown') then v_platform := 'unknown'; end if;
  update public.notification_tokens
  set user_id = v_user_id, platform = v_platform, device_name = p_device_name, device_id = p_device_id,
      app_ownership = p_app_ownership, app_version = p_app_version, project_id = p_project_id,
      is_active = true, disabled_at = null, last_registered_at = now(), updated_at = now()
  where expo_push_token = p_expo_push_token returning * into v_row;
  if found then return v_row; end if;
  insert into public.notification_tokens (user_id, expo_push_token, platform, device_name, device_id, app_ownership, app_version, project_id)
  values (v_user_id, p_expo_push_token, v_platform, p_device_name, p_device_id, p_app_ownership, p_app_version, p_project_id)
  returning * into v_row;
  return v_row;
end;
$function$

CREATE OR REPLACE FUNCTION public.validate_payment_obligation_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_obligation_user uuid;
  v_obligation_membership uuid;
begin
  if new.obligation_id is null then return new; end if;
  select user_id, membership_id into v_obligation_user, v_obligation_membership
  from public.payment_obligations where id = new.obligation_id;
  if v_obligation_user is null then raise exception 'Obligacion de pago no encontrada.'; end if;
  if new.user_id is distinct from v_obligation_user then raise exception 'El pago y la obligacion pertenecen a usuarios diferentes.'; end if;
  if new.membership_id is null and v_obligation_membership is not null then
    new.membership_id := v_obligation_membership;
  elsif new.membership_id is not null and v_obligation_membership is not null and new.membership_id is distinct from v_obligation_membership then
    raise exception 'La membresia del pago no coincide con la obligacion.';
  end if;
  return new;
end;
$function$

