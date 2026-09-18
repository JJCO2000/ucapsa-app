-- Preserve automatic program progression history.
--
-- Reverting a completed parent stage must not physically delete the automatically
-- unlocked child enrollment. The child is cancelled only while it has no
-- attendance, and the same linked row is reactivated if the parent is completed
-- again. Legacy Comandos-only helpers are removed because the consolidated
-- Puppy -> Básico -> Intermedio -> Avanzado flow is canonical.

drop function if exists public.trg_ucapsa_unlock_next_comandos_level();
drop function if exists public.ucapsa_unlock_next_comandos_level(uuid);

create or replace function public.ucapsa_unlock_next_program_stage(p_enrollment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.program_enrollments%rowtype;
  v_program_code text;
  v_next_program_id uuid;
  v_next_level text;
  v_next_schedule_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
begin
  select *
    into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id;

  if not found or v_enrollment.status <> 'completed' then
    return null;
  end if;

  select code
    into v_program_code
  from public.programs
  where id = v_enrollment.program_id;

  if v_program_code = 'puppy' then
    select id
      into v_next_program_id
    from public.programs
    where code = 'comandos'
      and is_active = true
    order by created_at asc
    limit 1;
    v_next_level := 'principiante';
  elsif v_program_code = 'comandos' and v_enrollment.program_level in ('base', 'principiante') then
    v_next_program_id := v_enrollment.program_id;
    v_next_level := 'medio';
  elsif v_program_code = 'comandos' and v_enrollment.program_level = 'medio' then
    v_next_program_id := v_enrollment.program_id;
    v_next_level := 'avanzado';
  else
    return null;
  end if;

  if v_next_program_id is null then
    raise exception 'No existe el siguiente programa activo para continuar la progresión.';
  end if;

  -- Si esta etapa ya había sido desbloqueada automáticamente, conserva su misma
  -- identidad. Sólo reactiva una cancelación automática vacía; una etapa con
  -- asistencias conserva cualquier cancelación administrativa.
  select e.id
    into v_existing_id
  from public.program_enrollments e
  where e.unlocked_from_enrollment_id = p_enrollment_id
  order by e.created_at asc
  limit 1;

  if v_existing_id is not null then
    update public.program_enrollments child
    set
      status = 'active',
      cancelled_at = null,
      updated_at = now()
    where child.id = v_existing_id
      and child.status = 'cancelled'
      and not exists (
        select 1
        from public.program_attendances a
        where a.enrollment_id = child.id
      );

    return v_existing_id;
  end if;

  -- Reutiliza una etapa ya creada para el mismo perro. Esto hace el backfill
  -- idempotente y evita duplicados en clientes históricos.
  select e.id
    into v_existing_id
  from public.program_enrollments e
  where e.user_id = v_enrollment.user_id
    and e.program_id = v_next_program_id
    and e.program_level = v_next_level
    and e.status in ('active', 'completed')
    and (
      (v_enrollment.dog_id is not null and e.dog_id = v_enrollment.dog_id)
      or (
        v_enrollment.dog_id is null
        and e.dog_id is null
        and lower(btrim(coalesce(e.dog_name, ''))) = lower(btrim(coalesce(v_enrollment.dog_name, '')))
      )
    )
  order by e.created_at asc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if v_program_code = 'comandos' then
    v_next_schedule_id := v_enrollment.schedule_id;
  else
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
  end if;

  if v_next_schedule_id is null then
    raise exception 'No hay un horario activo configurado para la siguiente etapa.';
  end if;

  insert into public.program_enrollments (
    user_id,
    program_id,
    schedule_id,
    dog_id,
    dog_name,
    physical_card_number,
    qr_token,
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
    null,
    concat('program_', replace(gen_random_uuid()::text, '-', '')),
    'active',
    0,
    v_next_level,
    null,
    case
      when v_program_code = 'puppy' then 'Básico desbloqueado automáticamente al completar Puppy.'
      when v_next_level = 'medio' then 'Intermedio desbloqueado automáticamente al completar Básico.'
      else 'Avanzado desbloqueado automáticamente al completar Intermedio.'
    end,
    (clock_timestamp() at time zone 'America/Mexico_City')::date,
    v_enrollment.id
  )
  returning id into v_new_id;

  return v_new_id;
exception
  when unique_violation then
    select e.id
      into v_existing_id
    from public.program_enrollments e
    where e.unlocked_from_enrollment_id = p_enrollment_id
    order by e.created_at asc
    limit 1;
    return v_existing_id;
end;
$$;

revoke all on function public.ucapsa_unlock_next_program_stage(uuid) from public;
revoke all on function public.ucapsa_unlock_next_program_stage(uuid) from anon;
revoke all on function public.ucapsa_unlock_next_program_stage(uuid) from authenticated;

create or replace function public.trg_ucapsa_unlock_next_program_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.ucapsa_unlock_next_program_stage(new.id);
  elsif tg_op = 'UPDATE'
    and old.status = 'completed'
    and new.status is distinct from 'completed' then
    update public.program_enrollments child
    set
      status = 'cancelled',
      cancelled_at = coalesce(child.cancelled_at, now()),
      updated_at = now()
    where child.unlocked_from_enrollment_id = new.id
      and child.status = 'active'
      and not exists (
        select 1
        from public.program_attendances a
        where a.enrollment_id = child.id
      );
  end if;

  return new;
end;
$$;

revoke all on function public.trg_ucapsa_unlock_next_program_stage() from public;
revoke all on function public.trg_ucapsa_unlock_next_program_stage() from anon;
revoke all on function public.trg_ucapsa_unlock_next_program_stage() from authenticated;

-- The active trigger already targets trg_ucapsa_unlock_next_program_stage().
-- Replacing the function above updates its behavior in place.
