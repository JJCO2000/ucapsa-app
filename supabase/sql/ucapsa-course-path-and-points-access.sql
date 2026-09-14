-- UCAPSA — ruta completa de cursos y acceso a Perro del Año
--
-- Reglas consolidadas:
--   * Puppy -> Básico -> Intermedio -> Avanzado.
--   * completar una etapa conserva su inscripción y todas sus asistencias;
--   * la siguiente etapa se desbloquea automáticamente con 0 asistencias;
--   * si Admin revierte una finalización y el hijo automático sigue vacío,
--     ese desbloqueo se retira para evitar dos etapas activas incoherentes;
--   * Perro del Año puede consultarse por cualquier usuario autenticado;
--   * solo socios con membresía status=active reciben puntos automáticos;
--   * Admin/Superadmin puede sumar o restar puntos con motivo obligatorio.

begin;

-- -----------------------------------------------------------------------------
-- 1. Una sola progresión oficial: Puppy -> Básico -> Intermedio -> Avanzado.
--    Retiramos los dos triggers anteriores antes de crear el consolidado.
-- -----------------------------------------------------------------------------

drop trigger if exists trg_ucapsa_unlock_next_comandos_level on public.program_enrollments;
drop trigger if exists trg_unlock_next_program_stage on public.program_enrollments;
drop trigger if exists trg_ucapsa_unlock_next_program_stage on public.program_enrollments;

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
    delete from public.program_enrollments child
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

create trigger trg_ucapsa_unlock_next_program_stage
after insert or update of status on public.program_enrollments
for each row
execute function public.trg_ucapsa_unlock_next_program_stage();

-- Backfill seguro para históricos. Si la etapa siguiente ya existe, la función
-- simplemente la reutiliza.
do $$
declare
  r record;
begin
  for r in
    select e.id
    from public.program_enrollments e
    join public.programs p on p.id = e.program_id
    where e.status = 'completed'
      and (
        p.code = 'puppy'
        or (p.code = 'comandos' and e.program_level in ('base', 'principiante', 'medio'))
      )
    order by e.completed_at nulls last, e.created_at
  loop
    perform public.ucapsa_unlock_next_program_stage(r.id);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Perro del Año: lectura para cualquier usuario autenticado.
--    No expone datos del dueño: solo perro, puntos, rango y si es el usuario actual.
-- -----------------------------------------------------------------------------

create or replace function public.get_ucapsa_points_leaderboard(
  p_limit integer default 50
)
returns table (
  rank bigint,
  dog_id uuid,
  display_name text,
  total_points bigint,
  tier_code text,
  tier_label text,
  is_current_user boolean,
  is_tied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_limit integer := greatest(3, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select id
    into v_season_id
  from public.ucapsa_points_seasons
  where status = 'active'
    and now() >= starts_at
    and now() < ends_at
  order by starts_at desc
  limit 1;

  if v_season_id is null then
    return;
  end if;

  return query
  with totals as (
    select
      p.id as participant_id,
      p.user_id,
      p.dog_id,
      p.display_name,
      coalesce(sum(l.points), 0)::bigint as total_points
    from public.ucapsa_points_participants p
    left join public.ucapsa_points_ledger l
      on l.season_id = p.season_id
     and l.participant_id = p.id
    where p.season_id = v_season_id
      and p.status = 'active'
      and p.visible_in_leaderboard = true
    group by p.id, p.user_id, p.dog_id, p.display_name
  ), ranked as (
    select
      t.*,
      dense_rank() over (order by t.total_points desc) as rank,
      count(*) over (partition by t.total_points) > 1 as is_tied
    from totals t
  ), visible as (
    select r.*
    from ranked r
    where r.rank <= v_limit
       or r.user_id = auth.uid()
  )
  select
    r.rank,
    r.dog_id,
    r.display_name,
    r.total_points,
    tier.code,
    tier.label,
    r.user_id = auth.uid(),
    r.is_tied
  from visible r
  left join lateral (
    select t.code, t.label
    from public.ucapsa_points_tiers t
    where t.season_id = v_season_id
      and t.min_points <= r.total_points
    order by t.min_points desc
    limit 1
  ) tier on true
  order by r.rank asc, r.display_name asc;
end;
$$;

revoke all on function public.get_ucapsa_points_leaderboard(integer) from public;
revoke all on function public.get_ucapsa_points_leaderboard(integer) from anon;
grant execute on function public.get_ucapsa_points_leaderboard(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Ajustes manuales de Admin/Superadmin.
-- -----------------------------------------------------------------------------

create or replace function public.admin_adjust_ucapsa_points(
  p_user_id uuid,
  p_dog_id uuid,
  p_points integer,
  p_reason text
)
returns table (
  ledger_id uuid,
  participant_id uuid,
  total_points bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_participant_id uuid;
  v_ledger_id uuid;
  v_total bigint;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null or p_dog_id is null then
    raise exception 'user_and_dog_required' using errcode = '22023';
  end if;
  if p_points is null or p_points = 0 then
    raise exception 'points_must_be_non_zero' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select id
    into v_season_id
  from public.ucapsa_points_seasons
  where status = 'active'
    and now() >= starts_at
    and now() < ends_at
  order by starts_at desc
  limit 1;

  if v_season_id is null then
    raise exception 'no_active_points_season' using errcode = '22023';
  end if;

  v_participant_id := public.ensure_ucapsa_points_participant(p_user_id, p_dog_id);
  if v_participant_id is null then
    raise exception 'participant_could_not_be_created' using errcode = '22023';
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
    'admin_adjustment',
    'admin_adjustment',
    null,
    'admin_adjustment:' || gen_random_uuid()::text,
    p_points,
    trim(p_reason),
    auth.uid(),
    now(),
    jsonb_build_object('mvp', true)
  )
  returning id into v_ledger_id;

  insert into public.admin_audit_logs (
    action,
    admin_user_id,
    entity_type,
    entity_id,
    details
  ) values (
    'ucapsa_points_adjustment',
    auth.uid(),
    'ucapsa_points_participant',
    v_participant_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'dog_id', p_dog_id,
      'points', p_points,
      'reason', trim(p_reason),
      'ledger_id', v_ledger_id
    )
  );

  select coalesce(sum(l.points), 0)::bigint
    into v_total
  from public.ucapsa_points_ledger l
  where l.season_id = v_season_id
    and l.participant_id = v_participant_id;

  return query
  select v_ledger_id, v_participant_id, v_total;
end;
$$;

revoke all on function public.admin_adjust_ucapsa_points(uuid, uuid, integer, text) from public;
revoke all on function public.admin_adjust_ucapsa_points(uuid, uuid, integer, text) from anon;
grant execute on function public.admin_adjust_ucapsa_points(uuid, uuid, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Scoring automático: +1 por asistencia confirmada, solo para Socios activos.
--    La membresía ya no usa end_date como fecha de vencimiento.
-- -----------------------------------------------------------------------------

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
    -- La gamificación nunca debe hacer fallar un registro de asistencia válido.
    raise warning 'UCAPSA points attendance award failed for attendance %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.award_ucapsa_point_for_program_attendance() from public;
revoke all on function public.award_ucapsa_point_for_program_attendance() from anon;
revoke all on function public.award_ucapsa_point_for_program_attendance() from authenticated;

commit;
