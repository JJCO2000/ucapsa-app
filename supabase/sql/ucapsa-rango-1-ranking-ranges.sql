-- UCAPSA Rango 1 — Rangos, Ranking y Podio derivado
--
-- Rango:
-- - mide Constancia, no score competitivo;
-- - participan todos los perros de la temporada, incluso con 0 actividad;
-- - 0 eventos siempre queda en Cobre;
-- - los empates de Constancia no se parten entre niveles;
-- - presentación pública simple: Oro top 10%, Plata 10%-40%, Cobre 40%-100%;
-- - top 5% recibe distinción derivada de Constancia sobresaliente.
--
-- Ranking:
-- - sólo perros elegibles;
-- - score DESC;
-- - desempate: asistencias a Comandos DESC;
-- - segundo desempate: puntos oficiales de Exámenes DESC;
-- - dog_id ASC sólo como desempate técnico estable.
--
-- Podio:
-- - posiciones 1, 2 y 3 del Ranking;
-- - no existe como logro ni dato editable.

create or replace view public.ucapsa_competition_ranges
with (security_invoker = true)
as
with ranked_constancy as (
  select
    s.*,
    percent_rank() over (
      partition by s.season_id
      order by coalesce(s.constancy_events_count, 0) desc
    ) as constancy_percent_rank
  from public.ucapsa_competition_scores s
),
population as (
  select
    s.season_id,
    count(*)::integer as constancy_population_count
  from public.ucapsa_competition_scores s
  group by s.season_id
)
select
  r.*,
  round((r.constancy_percent_rank::numeric * 100), 2) as constancy_percentile,
  case
    when p.constancy_population_count < 10 then 'forming'
    when coalesce(r.constancy_events_count, 0) = 0 then 'copper'
    when r.constancy_percent_rank < 0.10 then 'gold'
    when r.constancy_percent_rank < 0.40 then 'silver'
    else 'copper'
  end as range_code,
  case
    when p.constancy_population_count < 10 then 'Constancia en formación'
    when coalesce(r.constancy_events_count, 0) = 0 then 'Cobre'
    when r.constancy_percent_rank < 0.10 then 'Oro'
    when r.constancy_percent_rank < 0.40 then 'Plata'
    else 'Cobre'
  end as range_name,
  case
    when p.constancy_population_count < 10 then 0
    when coalesce(r.constancy_events_count, 0) = 0 then 1
    when r.constancy_percent_rank < 0.10 then 3
    when r.constancy_percent_rank < 0.40 then 2
    else 1
  end as range_level,
  (
    p.constancy_population_count >= 20
    and coalesce(r.constancy_events_count, 0) > 0
    and r.constancy_percent_rank < 0.05
  ) as is_constancy_outstanding,
  p.constancy_population_count,
  (p.constancy_population_count >= 10) as has_sufficient_constancy_population
from ranked_constancy r
join population p
  on p.season_id = r.season_id;

comment on view public.ucapsa_competition_ranges is
  'Nivel de Constancia por percentil de temporada. Con menos de 10 perros se muestra Constancia en formación; desde 10: Oro top 10%, Plata 10%-40%, Cobre 40%-100%; 0 eventos queda Cobre. Constancia sobresaliente top 5% sólo se activa con 20+ perros. Empates comparten nivel.';

revoke all on table public.ucapsa_competition_ranges
  from public, anon, authenticated;
grant select on table public.ucapsa_competition_ranges to authenticated;
grant select on table public.ucapsa_competition_ranges to service_role;


create or replace view public.ucapsa_competition_leaderboard
with (security_invoker = true)
as
select
  r.season_id,
  r.season_code,
  r.season_name,
  r.season_status,
  r.season_starts_at,
  r.season_ends_at,

  row_number() over (
    partition by r.season_id
    order by
      coalesce(r.competitive_score, 0::numeric) desc,
      coalesce(r.command_attendances_count, 0) desc,
      coalesce(r.exam_points, 0::numeric) desc,
      r.dog_id asc
  ) as ranking_position,

  count(*) over (
    partition by r.season_id
  ) as eligible_dogs_count,

  r.dog_id,
  r.dog_name,
  r.dog_is_active,

  r.competitive_score,
  r.constancy_points,
  r.command_attendances_count,
  r.member_visits_count,
  r.exam_points,
  r.admin_adjustment_points,

  r.required_exams_count,
  r.completed_required_exams_count,
  r.missing_required_exams_count,

  r.constancy_percentile,
  r.range_code,
  r.range_name,
  r.range_level,

  r.last_event_date,
  r.last_exam_published_at,
  r.last_adjustment_at,
  r.is_constancy_outstanding,
  r.constancy_population_count,
  r.has_sufficient_constancy_population
from public.ucapsa_competition_ranges r
where r.is_ranking_eligible is true;

comment on view public.ucapsa_competition_leaderboard is
  'Ranking determinista de perros elegibles: score DESC, Comandos DESC, puntos de Exámenes DESC, dog_id ASC. Podio = posiciones 1–3.';

revoke all on table public.ucapsa_competition_leaderboard
  from public, anon, authenticated;
grant select on table public.ucapsa_competition_leaderboard to authenticated;
grant select on table public.ucapsa_competition_leaderboard to service_role;


create or replace function public.get_ucapsa_competition_leaderboard(
  p_season_id uuid
)
returns setof public.ucapsa_competition_leaderboard
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.*
  from public.ucapsa_competition_leaderboard l
  where l.season_id = p_season_id
  order by l.ranking_position asc;
$$;

comment on function public.get_ucapsa_competition_leaderboard(uuid) is
  'Leaderboard seguro para usuarios autenticados. Expone sólo columnas competitivas; no owner_user_id ni datos privados del dueño.';

revoke all on function public.get_ucapsa_competition_leaderboard(uuid)
  from public, anon, authenticated;
grant execute on function public.get_ucapsa_competition_leaderboard(uuid)
  to authenticated;
grant execute on function public.get_ucapsa_competition_leaderboard(uuid)
  to service_role;
