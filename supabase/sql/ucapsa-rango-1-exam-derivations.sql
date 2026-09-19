-- UCAPSA Rango 1 — integridad y derivados canónicos de Exámenes
--
-- Regla central: el total de examen NUNCA se captura ni se persiste.
-- Se deriva siempre de ucapsa_exam_item_results + ucapsa_exam_items.
--
-- Este bloque tampoco define cuánto pesa un examen en Ranking.

-- -----------------------------------------------------------------------------
-- Ciclo de vida del examen.
-- Todo examen nace draft. Puede publicarse cuando ya tiene ejercicios y después
-- archivarse. No vuelve hacia atrás.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_exam_status_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_count bigint;
  v_season_status text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Un examen UCAPSA nuevo debe iniciar en borrador.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'published' then
    select s.status into v_season_status
    from public.ucapsa_competition_seasons s
    where s.id = new.season_id;

    if v_season_status not in ('active', 'reopened') then
      raise exception 'El examen sólo puede publicarse cuando la temporada está activa o reabierta.'
        using errcode = '55000';
    end if;

    select count(*) into v_items_count
    from public.ucapsa_exam_items i
    where i.exam_id = old.id;

    if v_items_count = 0 then
      raise exception 'No se puede publicar un examen UCAPSA sin ejercicios.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if (old.status = 'draft' and new.status = 'archived')
    or (old.status = 'published' and new.status = 'archived') then
    return new;
  end if;

  raise exception 'Transicion de examen UCAPSA invalida: % -> %', old.status, new.status
    using errcode = '55000';
end;
$$;

revoke all on function public.ucapsa_guard_exam_status_lifecycle()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_status_lifecycle on public.ucapsa_exams;
create trigger trg_ucapsa_guard_exam_status_lifecycle
before insert or update of status on public.ucapsa_exams
for each row execute function public.ucapsa_guard_exam_status_lifecycle();

-- -----------------------------------------------------------------------------
-- Ciclo de vida del intento.
-- Borrador -> Revisado -> Publicado -> Anulado.
-- También se puede anular antes de publicar para conservar trazabilidad.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_exam_attempt_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_count bigint;
  v_results_count bigint;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Un intento de examen UCAPSA nuevo debe iniciar en borrador.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'reviewed' then
    select count(*) into v_items_count
    from public.ucapsa_exam_items i
    where i.exam_id = new.exam_id;

    select count(*) into v_results_count
    from public.ucapsa_exam_item_results r
    join public.ucapsa_exam_items i on i.id = r.exam_item_id
    where r.attempt_id = new.id
      and i.exam_id = new.exam_id;

    if v_items_count = 0 or v_results_count <> v_items_count then
      raise exception 'No se puede revisar un intento incompleto: % de % ejercicios calificados.', v_results_count, v_items_count
        using errcode = '55000';
    end if;
    return new;
  end if;

  if (old.status = 'reviewed' and new.status = 'published')
    or (old.status in ('draft', 'reviewed', 'published') and new.status = 'voided') then
    return new;
  end if;

  raise exception 'Transicion de intento UCAPSA invalida: % -> %', old.status, new.status
    using errcode = '55000';
end;
$$;

revoke all on function public.ucapsa_guard_exam_attempt_lifecycle()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_attempt_lifecycle on public.ucapsa_exam_attempts;
create trigger trg_ucapsa_guard_exam_attempt_lifecycle
before insert or update of status on public.ucapsa_exam_attempts
for each row execute function public.ucapsa_guard_exam_attempt_lifecycle();

-- -----------------------------------------------------------------------------
-- Un intento publicado debe estar completo y pertenecer a un examen publicado.
-- Un 0 cuenta como calificación válida; lo que importa es que exista una fila de
-- resultado para cada ejercicio del examen.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_validate_exam_attempt_publishable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_status text;
  v_items_count bigint;
  v_results_count bigint;
begin
  if new.status <> 'published' then
    return new;
  end if;

  select e.status into v_exam_status
  from public.ucapsa_exams e
  where e.id = new.exam_id;

  if v_exam_status is distinct from 'published' then
    raise exception 'El examen UCAPSA debe estar publicado antes de publicar un resultado.'
      using errcode = '55000';
  end if;

  select count(*) into v_items_count
  from public.ucapsa_exam_items i
  where i.exam_id = new.exam_id;

  select count(*) into v_results_count
  from public.ucapsa_exam_item_results r
  join public.ucapsa_exam_items i on i.id = r.exam_item_id
  where r.attempt_id = new.id
    and i.exam_id = new.exam_id;

  if v_items_count = 0 or v_results_count <> v_items_count then
    raise exception 'No se puede publicar un intento incompleto: % de % ejercicios calificados.', v_results_count, v_items_count
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.ucapsa_validate_exam_attempt_publishable()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_validate_exam_attempt_publishable on public.ucapsa_exam_attempts;
create trigger trg_ucapsa_validate_exam_attempt_publishable
before insert or update on public.ucapsa_exam_attempts
for each row execute function public.ucapsa_validate_exam_attempt_publishable();

-- -----------------------------------------------------------------------------
-- Un resultado publicado puede corregir points_awarded, pero no puede perder una
-- fila ni cambiar de ejercicio/intento. Para eso primero se anula/desoficializa.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_published_exam_result_shape()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select a.status into v_status
  from public.ucapsa_exam_attempts a
  where a.id = old.attempt_id;

  if v_status in ('reviewed', 'published', 'voided') then
    raise exception 'No se puede eliminar o reasignar un ejercicio de un resultado revisado/publicado. Corrige su puntuacion o anula el intento.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_published_exam_result_shape()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_published_exam_result_delete on public.ucapsa_exam_item_results;
create trigger trg_ucapsa_guard_published_exam_result_delete
before delete on public.ucapsa_exam_item_results
for each row execute function public.ucapsa_guard_published_exam_result_shape();

drop trigger if exists trg_ucapsa_guard_published_exam_result_keys on public.ucapsa_exam_item_results;
create trigger trg_ucapsa_guard_published_exam_result_keys
before update of attempt_id, exam_item_id on public.ucapsa_exam_item_results
for each row execute function public.ucapsa_guard_published_exam_result_shape();

-- -----------------------------------------------------------------------------
-- La estructura que define un puntaje oficial no puede cambiar por debajo de los
-- resultados ya publicados. Texto descriptivo y sort_order sí pueden corregirse.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_exam_item_structure_after_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id uuid;
  v_exam_status text;
  v_target_exam_status text;
  v_has_locked_attempt boolean;
  v_has_results boolean;
  v_max_awarded numeric;
begin
  if tg_op = 'INSERT' then v_exam_id := new.exam_id; else v_exam_id := old.exam_id; end if;

  select e.status into v_exam_status
  from public.ucapsa_exams e
  where e.id = v_exam_id;

  if v_exam_status is distinct from 'draft' then
    raise exception 'La estructura de un examen publicado o archivado no puede modificarse.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and new.exam_id is distinct from old.exam_id then
    select e.status into v_target_exam_status
    from public.ucapsa_exams e
    where e.id = new.exam_id;

    if v_target_exam_status is distinct from 'draft' then
      raise exception 'Un ejercicio solo puede moverse a otro examen en borrador.'
        using errcode = '55000';
    end if;
  end if;

  select exists (
    select 1
    from public.ucapsa_exam_attempts a
    where a.exam_id = v_exam_id
      and a.status in ('reviewed', 'published', 'voided')
  ) into v_has_locked_attempt;

  if tg_op = 'INSERT' and v_has_locked_attempt then
    raise exception 'No se pueden agregar ejercicios a un examen con intentos revisados/publicados/anulados.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' and v_has_locked_attempt then
    raise exception 'No se pueden eliminar ejercicios de un examen con intentos revisados/publicados/anulados.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' then
    if new.exam_id is distinct from old.exam_id then
      select exists (
        select 1 from public.ucapsa_exam_item_results r
        where r.exam_item_id = old.id
      ) into v_has_results;

      if v_has_results then
        raise exception 'No se puede mover a otro examen un ejercicio que ya tiene resultados.'
          using errcode = '55000';
      end if;
    end if;

    if new.max_points is distinct from old.max_points then
      select max(r.points_awarded) into v_max_awarded
      from public.ucapsa_exam_item_results r
      where r.exam_item_id = old.id;

      if v_max_awarded is not null and new.max_points < v_max_awarded then
        raise exception 'El nuevo maximo (%) es menor que una puntuacion ya capturada (%).', new.max_points, v_max_awarded
          using errcode = '55000';
      end if;
    end if;

    if (new.exam_id is distinct from old.exam_id
      or new.item_number is distinct from old.item_number
      or new.max_points is distinct from old.max_points) then
      if v_has_locked_attempt or exists (
        select 1
        from public.ucapsa_exam_attempts a
        where a.exam_id = new.exam_id
          and a.status in ('reviewed', 'published', 'voided')
      ) then
        raise exception 'No se puede cambiar la estructura o puntaje maximo de un examen con intentos revisados/publicados/anulados.'
          using errcode = '55000';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_exam_item_structure_after_publish()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_item_structure_after_publish on public.ucapsa_exam_items;
create trigger trg_ucapsa_guard_exam_item_structure_after_publish
before insert or update or delete on public.ucapsa_exam_items
for each row execute function public.ucapsa_guard_exam_item_structure_after_publish();

-- -----------------------------------------------------------------------------
-- Derivado canónico por intento.
-- total_points_awarded y max_points se calculan desde ejercicios/resultados.
-- -----------------------------------------------------------------------------

create or replace view public.ucapsa_exam_attempt_summary
with (security_invoker = true)
as
select
  e.season_id,
  e.id as exam_id,
  e.code as exam_code,
  e.title as exam_title,
  e.exam_date,
  e.is_required_for_ranking,
  e.status as exam_status,
  a.id as attempt_id,
  a.dog_id,
  a.attempt_number,
  a.status as attempt_status,
  a.is_official,
  a.presented_at,
  a.published_at,
  count(i.id)::bigint as items_count,
  count(r.exam_item_id)::bigint as graded_items_count,
  coalesce(sum(i.max_points), 0::numeric) as max_points,
  coalesce(sum(r.points_awarded), 0::numeric) as total_points_awarded,
  (count(i.id) > 0 and count(r.exam_item_id) = count(i.id)) as is_complete
from public.ucapsa_exam_attempts a
join public.ucapsa_exams e on e.id = a.exam_id
left join public.ucapsa_exam_items i on i.exam_id = e.id
left join public.ucapsa_exam_item_results r
  on r.attempt_id = a.id
 and r.exam_item_id = i.id
group by
  e.season_id, e.id, e.code, e.title, e.exam_date,
  e.is_required_for_ranking, e.status,
  a.id, a.dog_id, a.attempt_number, a.status,
  a.is_official, a.presented_at, a.published_at;

comment on view public.ucapsa_exam_attempt_summary is
  'SSOT derivado por intento: total y maximo se calculan desde resultados por ejercicio; nunca se capturan manualmente.';

create or replace view public.ucapsa_exam_official_results
with (security_invoker = true)
as
select *
from public.ucapsa_exam_attempt_summary
where exam_status = 'published'
  and attempt_status = 'published'
  and is_official = true
  and is_complete = true;

comment on view public.ucapsa_exam_official_results is
  'Resultados oficiales publicados y completos por perro/examen. Fuente para elegibilidad y futura competencia.';

-- -----------------------------------------------------------------------------
-- Elegibilidad dog-specific por temporada.
-- Solo exámenes obligatorios YA PUBLICADOS forman parte del requisito activo.
-- Un draft todavía no altera la elegibilidad pública.
-- Cero exámenes obligatorios publicados => todavía no elegible.
-- -----------------------------------------------------------------------------

create or replace view public.ucapsa_exam_eligibility
with (security_invoker = true)
as
with required as (
  select e.season_id, count(*)::bigint as required_exams_count
  from public.ucapsa_exams e
  where e.is_required_for_ranking = true
    and e.status = 'published'
  group by e.season_id
),
completed as (
  select r.season_id, r.dog_id, count(*)::bigint as completed_required_exams_count
  from public.ucapsa_exam_official_results r
  where r.is_required_for_ranking = true
  group by r.season_id, r.dog_id
)
select
  s.id as season_id,
  d.id as dog_id,
  coalesce(req.required_exams_count, 0)::bigint as required_exams_count,
  coalesce(done.completed_required_exams_count, 0)::bigint as completed_required_exams_count,
  greatest(
    coalesce(req.required_exams_count, 0) - coalesce(done.completed_required_exams_count, 0),
    0
  )::bigint as missing_required_exams_count,
  (
    coalesce(req.required_exams_count, 0) > 0
    and coalesce(done.completed_required_exams_count, 0) = req.required_exams_count
  ) as is_ranking_eligible
from public.ucapsa_competition_seasons s
cross join public.dogs d
left join required req on req.season_id = s.id
left join completed done on done.season_id = s.id and done.dog_id = d.id
where s.status <> 'draft';

comment on view public.ucapsa_exam_eligibility is
  'Elegibilidad dog-specific por temporada derivada de resultados oficiales de todos los examenes obligatorios publicados.';

revoke all privileges on public.ucapsa_exam_attempt_summary from public, anon, authenticated;
revoke all privileges on public.ucapsa_exam_official_results from public, anon, authenticated;
revoke all privileges on public.ucapsa_exam_eligibility from public, anon, authenticated;

grant select on public.ucapsa_exam_attempt_summary to authenticated;
grant select on public.ucapsa_exam_official_results to authenticated;
grant select on public.ucapsa_exam_eligibility to authenticated;

grant select on public.ucapsa_exam_attempt_summary to service_role;
grant select on public.ucapsa_exam_official_results to service_role;
grant select on public.ucapsa_exam_eligibility to service_role;
