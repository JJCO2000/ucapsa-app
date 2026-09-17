-- UCAPSA Rango 1 — insumos competitivos canónicos
--
-- Esta vista NO calcula score, Rango, posición ni podio.
-- Sólo reúne las fuentes verdaderas ya cerradas para que la futura fórmula
-- competitiva tenga un único contrato de entrada por dog_id + season_id.

create or replace view public.ucapsa_competition_inputs
with (security_invoker = true)
as
with exam_aggregate as (
  select
    r.season_id,
    r.dog_id,
    count(*) as official_exams_count,
    count(*) filter (where r.is_required_for_ranking) as required_official_exams_count,
    count(*) filter (where not r.is_required_for_ranking) as optional_official_exams_count,
    coalesce(sum(r.total_points_awarded), 0::numeric) as official_exam_points_awarded,
    coalesce(sum(r.max_points), 0::numeric) as official_exam_max_points,
    coalesce(sum(r.total_points_awarded) filter (where r.is_required_for_ranking), 0::numeric)
      as required_exam_points_awarded,
    coalesce(sum(r.max_points) filter (where r.is_required_for_ranking), 0::numeric)
      as required_exam_max_points,
    coalesce(sum(r.total_points_awarded) filter (where not r.is_required_for_ranking), 0::numeric)
      as optional_exam_points_awarded,
    coalesce(sum(r.max_points) filter (where not r.is_required_for_ranking), 0::numeric)
      as optional_exam_max_points,
    max(r.published_at) as last_exam_published_at
  from public.ucapsa_exam_official_results r
  group by r.season_id, r.dog_id
)
select
  e.season_id,
  s.code as season_code,
  s.name as season_name,
  s.status as season_status,
  s.starts_at as season_starts_at,
  s.ends_at as season_ends_at,

  e.dog_id,
  d.user_id as owner_user_id,
  d.name as dog_name,
  d.is_active as dog_is_active,

  coalesce(c.command_attendances_count, 0::bigint) as command_attendances_count,
  coalesce(c.member_visits_count, 0::bigint) as member_visits_count,
  coalesce(c.constancy_events_count, 0::bigint) as constancy_events_count,
  c.first_event_date,
  c.last_event_date,

  e.required_exams_count,
  e.completed_required_exams_count,
  e.missing_required_exams_count,
  e.is_ranking_eligible,

  coalesce(x.official_exams_count, 0::bigint) as official_exams_count,
  coalesce(x.required_official_exams_count, 0::bigint) as required_official_exams_count,
  coalesce(x.optional_official_exams_count, 0::bigint) as optional_official_exams_count,
  coalesce(x.official_exam_points_awarded, 0::numeric) as official_exam_points_awarded,
  coalesce(x.official_exam_max_points, 0::numeric) as official_exam_max_points,
  coalesce(x.required_exam_points_awarded, 0::numeric) as required_exam_points_awarded,
  coalesce(x.required_exam_max_points, 0::numeric) as required_exam_max_points,
  coalesce(x.optional_exam_points_awarded, 0::numeric) as optional_exam_points_awarded,
  coalesce(x.optional_exam_max_points, 0::numeric) as optional_exam_max_points,
  x.last_exam_published_at,

  coalesce(a.movement_count, 0::bigint) as admin_adjustment_movement_count,
  coalesce(a.adjustment_points, 0) as admin_adjustment_points,
  a.last_adjustment_at,

  (
    coalesce(c.constancy_events_count, 0) > 0
    or coalesce(x.official_exams_count, 0) > 0
    or coalesce(a.movement_count, 0) > 0
  ) as has_competition_activity
from public.ucapsa_exam_eligibility e
join public.ucapsa_competition_seasons s
  on s.id = e.season_id
join public.dogs d
  on d.id = e.dog_id
left join public.ucapsa_constancy_summary c
  on c.season_id = e.season_id
 and c.dog_id = e.dog_id
left join exam_aggregate x
  on x.season_id = e.season_id
 and x.dog_id = e.dog_id
left join public.ucapsa_competition_adjustment_summary a
  on a.season_id = e.season_id
 and a.dog_id = e.dog_id;

comment on view public.ucapsa_competition_inputs is
  'Rango 1: insumos competitivos dog+season derivados de Constancia, Exámenes oficiales, elegibilidad y Ajustes Admin. No calcula score/rango/ranking/podio.';

revoke all on table public.ucapsa_competition_inputs
  from public, anon, authenticated;
grant select on table public.ucapsa_competition_inputs to authenticated;
grant select on table public.ucapsa_competition_inputs to service_role;
