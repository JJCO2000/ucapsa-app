-- UCAPSA Rango 1 — constancia dog-specific por temporada
--
-- Este bloque NO define puntos, rangos ni ranking.
-- Deriva hechos y resumen desde las fuentes canónicas existentes:
-- - program_attendances + program_enrollments.dog_id
-- - member_visits + member_visit_dogs
-- - ucapsa_competition_seasons
--
-- No persiste totales editables. Las vistas siempre reflejan correcciones en origen.

-- Las temporadas competitivas son periodos por día en horario de CDMX.
-- starts_at es inclusivo y ends_at exclusivo; ambos deben caer a medianoche local.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ucapsa_competition_seasons_local_day_bounds'
      and conrelid = 'public.ucapsa_competition_seasons'::regclass
  ) then
    alter table public.ucapsa_competition_seasons
      add constraint ucapsa_competition_seasons_local_day_bounds
      check (
        (starts_at at time zone 'America/Mexico_City')::time = time '00:00:00'
        and (ends_at at time zone 'America/Mexico_City')::time = time '00:00:00'
      );
  end if;
end
$$;

create or replace view public.ucapsa_constancy_events
with (security_invoker = true)
as
with command_candidates as (
  select
    s.id as season_id,
    pe.dog_id,
    pa.id as source_id,
    pa.attendance_date as event_date,
    pa.source,
    pa.enrollment_id,
    pa.session_id,
    row_number() over (
      partition by
        s.id,
        pe.dog_id,
        case
          when pa.session_id is not null then 'session:' || pa.session_id::text
          else 'attendance:' || pa.id::text
        end
      order by pa.created_at asc, pa.id asc
    ) as occurrence_rank
  from public.program_attendances pa
  join public.program_enrollments pe
    on pe.id = pa.enrollment_id
  join public.ucapsa_competition_seasons s
    on pa.attendance_date >= (s.starts_at at time zone 'America/Mexico_City')::date
   and pa.attendance_date <  (s.ends_at   at time zone 'America/Mexico_City')::date
  where pe.dog_id is not null
)
select
  season_id,
  dog_id,
  'command_attendance'::text as event_type,
  source_id,
  event_date,
  source,
  enrollment_id,
  session_id,
  null::uuid as member_visit_id
from command_candidates
where occurrence_rank = 1

union all

select
  s.id as season_id,
  mvd.dog_id,
  'member_visit'::text as event_type,
  mv.id as source_id,
  mv.visit_date as event_date,
  mv.source,
  null::uuid as enrollment_id,
  null::uuid as session_id,
  mv.id as member_visit_id
from public.member_visit_dogs mvd
join public.member_visits mv
  on mv.id = mvd.visit_id
join public.ucapsa_competition_seasons s
  on mv.visit_date >= (s.starts_at at time zone 'America/Mexico_City')::date
 and mv.visit_date <  (s.ends_at   at time zone 'America/Mexico_City')::date;

comment on view public.ucapsa_constancy_events is
  'Hechos derivados de constancia UCAPSA por perro y temporada. Una sesión de Comandos cuenta máximo una vez por perro.';

create or replace view public.ucapsa_constancy_summary
with (security_invoker = true)
as
select
  season_id,
  dog_id,
  count(*) filter (where event_type = 'command_attendance')::bigint as command_attendances_count,
  count(*) filter (where event_type = 'member_visit')::bigint as member_visits_count,
  count(*)::bigint as constancy_events_count,
  min(event_date) as first_event_date,
  max(event_date) as last_event_date
from public.ucapsa_constancy_events
group by season_id, dog_id;

comment on view public.ucapsa_constancy_summary is
  'Resumen derivado de constancia por dog_id + season_id. No persiste ponderaciones competitivas.';

revoke all privileges on public.ucapsa_constancy_events from public, anon, authenticated;
revoke all privileges on public.ucapsa_constancy_summary from public, anon, authenticated;

grant select on public.ucapsa_constancy_events to authenticated;
grant select on public.ucapsa_constancy_summary to authenticated;
grant select on public.ucapsa_constancy_events to service_role;
grant select on public.ucapsa_constancy_summary to service_role;
