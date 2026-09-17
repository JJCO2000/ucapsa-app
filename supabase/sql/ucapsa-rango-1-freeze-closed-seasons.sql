-- UCAPSA Rango 1 — congelar hechos competitivos de temporadas cerradas
--
-- Una temporada `closed` es inmutable en sus fuentes competitivas.
-- Para corregirla, Superadmin debe pasarla primero a `reopened`.
--
-- Este bloque NO define puntos, rangos ni ranking.
-- Tampoco congela dog_awards: Perro del Año puede otorgarse después del cierre.

-- -----------------------------------------------------------------------------
-- Helpers internos. No se exponen como RPC.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_assert_competition_date_mutable(
  p_event_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_season_name text;
begin
  if p_event_date is null then
    return;
  end if;

  select s.id, s.name
    into v_season_id, v_season_name
  from public.ucapsa_competition_seasons s
  where s.status = 'closed'
    and p_event_date >= (s.starts_at at time zone 'America/Mexico_City')::date
    and p_event_date <  (s.ends_at   at time zone 'America/Mexico_City')::date
  limit 1;

  if found then
    raise exception 'La temporada UCAPSA "%" esta cerrada. Reabrela antes de modificar hechos competitivos.', v_season_name
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.ucapsa_assert_competition_season_mutable(
  p_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_name text;
begin
  if p_season_id is null then
    return;
  end if;

  select s.status, s.name
    into v_status, v_name
  from public.ucapsa_competition_seasons s
  where s.id = p_season_id;

  if found and v_status = 'closed' then
    raise exception 'La temporada UCAPSA "%" esta cerrada. Reabrela antes de modificar hechos competitivos.', v_name
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.ucapsa_assert_competition_date_mutable(date)
  from public, anon, authenticated;
revoke all on function public.ucapsa_assert_competition_season_mutable(uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Temporadas: una cerrada no puede borrarse ni editar sus limites en el mismo
-- paso en que se reabre. Primero closed -> reopened; despues se corrige.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_closed_season_definition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then
      raise exception 'Una temporada UCAPSA cerrada no puede eliminarse. Reabrela primero.'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if old.status = 'closed' then
    if new.code is distinct from old.code
      or new.name is distinct from old.name
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at then
      raise exception 'Una temporada UCAPSA cerrada no puede cambiar su definicion. Reabrela primero.'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.ucapsa_guard_closed_season_definition()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_closed_season_definition
  on public.ucapsa_competition_seasons;
create trigger trg_ucapsa_guard_closed_season_definition
before update or delete on public.ucapsa_competition_seasons
for each row execute function public.ucapsa_guard_closed_season_definition();

-- -----------------------------------------------------------------------------
-- Constancia: Comandos.
-- Se valida OLD y NEW para impedir tanto sacar un hecho de una temporada cerrada
-- como mover un hecho nuevo dentro de ella.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_program_attendance_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ucapsa_assert_competition_date_mutable(old.attendance_date);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ucapsa_assert_competition_date_mutable(new.attendance_date);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_program_attendance_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_program_attendance_closed_season
  on public.program_attendances;
create trigger trg_ucapsa_guard_program_attendance_closed_season
before insert or update or delete on public.program_attendances
for each row execute function public.ucapsa_guard_program_attendance_closed_season();

-- Cambiar o borrar la inscripcion podria reasignar/borrar en cascada asistencias
-- de una temporada cerrada aunque program_attendances no se editara directamente.
create or replace function public.ucapsa_guard_enrollment_closed_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_closed_attendance boolean;
begin
  if tg_op = 'UPDATE' and new.dog_id is not distinct from old.dog_id then
    return new;
  end if;

  select exists (
    select 1
    from public.program_attendances pa
    join public.ucapsa_competition_seasons s
      on pa.attendance_date >= (s.starts_at at time zone 'America/Mexico_City')::date
     and pa.attendance_date <  (s.ends_at   at time zone 'America/Mexico_City')::date
    where pa.enrollment_id = old.id
      and s.status = 'closed'
  ) into v_has_closed_attendance;

  if v_has_closed_attendance then
    raise exception 'La inscripcion tiene asistencias en una temporada UCAPSA cerrada. Reabre la temporada antes de reasignar o eliminar la inscripcion.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_enrollment_closed_attendance()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_enrollment_closed_attendance
  on public.program_enrollments;
create trigger trg_ucapsa_guard_enrollment_closed_attendance
before update of dog_id or delete on public.program_enrollments
for each row execute function public.ucapsa_guard_enrollment_closed_attendance();

-- -----------------------------------------------------------------------------
-- Constancia: visitas de socio y snapshot multi-perro.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_member_visit_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ucapsa_assert_competition_date_mutable(old.visit_date);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ucapsa_assert_competition_date_mutable(new.visit_date);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_member_visit_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_member_visit_closed_season
  on public.member_visits;
create trigger trg_ucapsa_guard_member_visit_closed_season
before insert or update or delete on public.member_visits
for each row execute function public.ucapsa_guard_member_visit_closed_season();

create or replace function public.ucapsa_guard_member_visit_dog_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit_date date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select mv.visit_date into v_visit_date
    from public.member_visits mv
    where mv.id = old.visit_id;

    if found then
      perform public.ucapsa_assert_competition_date_mutable(v_visit_date);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select mv.visit_date into v_visit_date
    from public.member_visits mv
    where mv.id = new.visit_id;

    if found then
      perform public.ucapsa_assert_competition_date_mutable(v_visit_date);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_member_visit_dog_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_member_visit_dog_closed_season
  on public.member_visit_dogs;
create trigger trg_ucapsa_guard_member_visit_dog_closed_season
before insert or update or delete on public.member_visit_dogs
for each row execute function public.ucapsa_guard_member_visit_dog_closed_season();

-- -----------------------------------------------------------------------------
-- Examenes: definicion, ejercicios, intentos y resultados.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_exam_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ucapsa_assert_competition_season_mutable(old.season_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ucapsa_assert_competition_season_mutable(new.season_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_exam_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_closed_season on public.ucapsa_exams;
create trigger trg_ucapsa_guard_exam_closed_season
before insert or update or delete on public.ucapsa_exams
for each row execute function public.ucapsa_guard_exam_closed_season();

create or replace function public.ucapsa_assert_exam_mutable(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
begin
  select e.season_id into v_season_id
  from public.ucapsa_exams e
  where e.id = p_exam_id;

  if found then
    perform public.ucapsa_assert_competition_season_mutable(v_season_id);
  end if;
end;
$$;

revoke all on function public.ucapsa_assert_exam_mutable(uuid)
  from public, anon, authenticated;

create or replace function public.ucapsa_guard_exam_item_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ucapsa_assert_exam_mutable(old.exam_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ucapsa_assert_exam_mutable(new.exam_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_exam_item_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_item_closed_season on public.ucapsa_exam_items;
create trigger trg_ucapsa_guard_exam_item_closed_season
before insert or update or delete on public.ucapsa_exam_items
for each row execute function public.ucapsa_guard_exam_item_closed_season();

create or replace function public.ucapsa_guard_exam_attempt_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ucapsa_assert_exam_mutable(old.exam_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ucapsa_assert_exam_mutable(new.exam_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_exam_attempt_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_attempt_closed_season on public.ucapsa_exam_attempts;
create trigger trg_ucapsa_guard_exam_attempt_closed_season
before insert or update or delete on public.ucapsa_exam_attempts
for each row execute function public.ucapsa_guard_exam_attempt_closed_season();

create or replace function public.ucapsa_assert_exam_attempt_mutable(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
begin
  select e.season_id into v_season_id
  from public.ucapsa_exam_attempts a
  join public.ucapsa_exams e on e.id = a.exam_id
  where a.id = p_attempt_id;

  if found then
    perform public.ucapsa_assert_competition_season_mutable(v_season_id);
  end if;
end;
$$;

revoke all on function public.ucapsa_assert_exam_attempt_mutable(uuid)
  from public, anon, authenticated;

create or replace function public.ucapsa_guard_exam_result_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ucapsa_assert_exam_attempt_mutable(old.attempt_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ucapsa_assert_exam_attempt_mutable(new.attempt_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_exam_result_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_result_closed_season on public.ucapsa_exam_item_results;
create trigger trg_ucapsa_guard_exam_result_closed_season
before insert or update or delete on public.ucapsa_exam_item_results
for each row execute function public.ucapsa_guard_exam_result_closed_season();

-- -----------------------------------------------------------------------------
-- Ajustes Admin e importaciones masivas tambien forman parte del resultado de la
-- temporada y no pueden cambiar cuando esta cerrada.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_adjustment_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ucapsa_assert_competition_season_mutable(old.season_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ucapsa_assert_competition_season_mutable(new.season_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_adjustment_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_adjustment_closed_season on public.ucapsa_competition_adjustments;
create trigger trg_ucapsa_guard_adjustment_closed_season
before insert or update or delete on public.ucapsa_competition_adjustments
for each row execute function public.ucapsa_guard_adjustment_closed_season();

create or replace function public.ucapsa_guard_import_batch_closed_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ucapsa_assert_competition_season_mutable(old.season_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ucapsa_assert_competition_season_mutable(new.season_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_import_batch_closed_season()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_import_batch_closed_season on public.ucapsa_import_batches;
create trigger trg_ucapsa_guard_import_batch_closed_season
before insert or update or delete on public.ucapsa_import_batches
for each row execute function public.ucapsa_guard_import_batch_closed_season();
