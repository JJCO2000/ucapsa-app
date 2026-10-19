-- UCAPSA: completar etapa desde avance real (asistencias ordinarias +
-- evidencia histórica administrativa) sin duplicar clases ni inventar fechas.
-- Basado en la función ACTUAL de producción consultada; cambia solo
-- la fuente de cómputo del número de clases al validar la decisión.
-- Mantener sus guards Admin, progresión, auditoría y logros.
CREATE OR REPLACE FUNCTION public.admin_resolve_training_card_decision(p_enrollment_id uuid, p_decision text, p_new_card_number text DEFAULT NULL::text)
 RETURNS TABLE(decision text, next_enrollment_id uuid, awarded_achievement_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enrollment public.program_enrollments%rowtype;
  v_program public.programs%rowtype;
  v_attendance_count integer := 0;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_next_program_id uuid;
  v_next_schedule_id uuid;
  v_next_level text;
  v_next_enrollment_id uuid;
  v_achievement_code text;
  v_customer_name text;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede resolver una tarjeta lista para evaluación.'
      using errcode = '42501';
  end if;

  if v_decision not in ('no_continue', 'repeat_level', 'next_level') then
    raise exception 'Decisión de entrenamiento no válida.'
      using errcode = '22023';
  end if;

  select *
    into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id
  for update;

  if not found then
    raise exception 'Inscripción no encontrada.'
      using errcode = '22023';
  end if;

  if v_enrollment.status <> 'active' then
    raise exception 'Esta tarjeta ya no está activa.'
      using errcode = '22023';
  end if;

  select *
    into v_program
  from public.programs
  where id = v_enrollment.program_id;

  if not found then
    raise exception 'Programa no encontrado.'
      using errcode = '22023';
  end if;

  -- Reconocer avances de ambos orígenes oficiales, sin fabricar fechas.
  -- Las evidencias históricas tienen fuente auditada e identificador único.
  select (
    (select count(*)::integer
       from public.program_attendances a
      where a.enrollment_id = v_enrollment.id)
    + coalesce((
       select sum(h.quantity)::integer
         from public.program_attendance_historical_evidence h
        where h.enrollment_id = v_enrollment.id
     ), 0)
  ) into v_attendance_count;

  if v_attendance_count < greatest(1, coalesce(v_program.required_attendances, 0)) then
    raise exception 'La tarjeta todavía no tiene todas las asistencias requeridas.'
      using errcode = '22023';
  end if;

  if v_decision = 'next_level' then
    if v_program.code = 'puppy' then
      select p.id
        into v_next_program_id
      from public.programs p
      where p.code = 'comandos'
        and p.is_active = true
      order by p.created_at asc
      limit 1;

      v_next_level := 'principiante';
      v_achievement_code := 'puppy_completed';

      select s.id
        into v_next_schedule_id
      from public.program_schedules s
      join lateral public.get_effective_program_schedule(
        s.id,
        (clock_timestamp() at time zone 'America/Mexico_City')::date
      ) effective on true
      where s.program_id = v_next_program_id
        and effective.is_active = true
      order by effective.sequence_order, effective.day_of_week, effective.start_time
      limit 1;
    elsif v_program.code = 'comandos'
      and v_enrollment.program_level in ('base', 'principiante') then
      v_next_program_id := v_enrollment.program_id;
      v_next_schedule_id := v_enrollment.schedule_id;
      v_next_level := 'medio';
      v_achievement_code := 'comandos_basico_completed';
    elsif v_program.code = 'comandos'
      and v_enrollment.program_level = 'medio' then
      v_next_program_id := v_enrollment.program_id;
      v_next_schedule_id := v_enrollment.schedule_id;
      v_next_level := 'avanzado';
      v_achievement_code := 'comandos_medio_completed';
    else
      raise exception 'Avanzado no tiene un nivel posterior. Usa repetir o no continúa.'
        using errcode = '22023';
    end if;

    if v_next_program_id is null or v_next_schedule_id is null then
      raise exception 'No hay programa u horario disponible para la siguiente etapa.'
        using errcode = '22023';
    end if;
  elsif v_decision = 'repeat_level' then
    v_next_program_id := v_enrollment.program_id;
    v_next_schedule_id := v_enrollment.schedule_id;
    v_next_level := v_enrollment.program_level;
  end if;

  update public.program_enrollments
  set
    status = 'completed',
    completed_at = coalesce(completed_at, clock_timestamp()),
    cancelled_at = null,
    updated_at = clock_timestamp()
  where id = v_enrollment.id;

  if v_decision in ('repeat_level', 'next_level') then
    insert into public.program_enrollments (
      user_id,
      program_id,
      schedule_id,
      dog_id,
      dog_name,
      physical_card_number,
      status,
      attendances_count,
      program_level,
      last_attendance_at,
      notes,
      started_at,
      unlocked_from_enrollment_id
    ) values (
      v_enrollment.user_id,
      v_next_program_id,
      v_next_schedule_id,
      v_enrollment.dog_id,
      v_enrollment.dog_name,
      nullif(btrim(p_new_card_number), ''),
      'active',
      0,
      v_next_level,
      null,
      case
        when v_decision = 'repeat_level' then 'Nueva tarjeta creada porque Admin indicó repetir nivel.'
        else 'Nueva etapa creada después de aprobación administrativa.'
      end,
      (clock_timestamp() at time zone 'America/Mexico_City')::date,
      case when v_decision = 'next_level' then v_enrollment.id else null end
    )
    returning id into v_next_enrollment_id;
  end if;

  if v_achievement_code is not null and v_enrollment.dog_id is not null then
    insert into public.user_achievements (
      user_id,
      dog_id,
      achievement_code,
      source_type,
      source_id,
      awarded_at,
      awarded_by
    )
    select
      v_enrollment.user_id,
      v_enrollment.dog_id,
      v_achievement_code,
      'program_progression',
      null,
      clock_timestamp(),
      auth.uid()
    where not exists (
      select 1
      from public.user_achievements ua
      where ua.user_id = v_enrollment.user_id
        and ua.dog_id = v_enrollment.dog_id
        and ua.achievement_code = v_achievement_code
    );
  end if;

  select coalesce(p.full_name, p.email, 'Cliente UCAPSA')
    into v_customer_name
  from public.profiles p
  where p.user_id = v_enrollment.user_id
  limit 1;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'training_card.decision',
    'program_enrollment',
    v_enrollment.id,
    jsonb_build_object(
      'decision', v_decision,
      'user_id', v_enrollment.user_id,
      'customer_name', coalesce(v_customer_name, 'Cliente UCAPSA'),
      'dog_id', v_enrollment.dog_id,
      'dog_name', v_enrollment.dog_name,
      'program_code', v_program.code,
      'program_level', v_enrollment.program_level,
      'physical_card_number', v_enrollment.physical_card_number,
      'attendance_count', v_attendance_count,
      'required_attendances', v_program.required_attendances,
      'next_enrollment_id', v_next_enrollment_id,
      'next_program_level', v_next_level,
      'awarded_achievement_code', v_achievement_code
    )
  );

  return query
  select v_decision, v_next_enrollment_id, v_achievement_code;
end;
$function$
