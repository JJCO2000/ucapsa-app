-- UCAPSA Rango 1 — puntaje competitivo derivado
--
-- Regla aprobada:
-- - cada evento de Constancia vale 1 punto;
-- - los Exámenes aportan exactamente los puntos oficiales capturados;
-- - los Ajustes Admin suman o restan puntos.
--
-- No persiste un total editable. No asigna Rango, posición ni Podio.

create or replace view public.ucapsa_competition_scores
with (security_invoker = true)
as
select
  i.season_id,
  i.season_code,
  i.season_name,
  i.season_status,
  i.season_starts_at,
  i.season_ends_at,

  i.dog_id,
  i.owner_user_id,
  i.dog_name,
  i.dog_is_active,

  i.command_attendances_count,
  i.member_visits_count,
  i.constancy_events_count,
  coalesce(i.constancy_events_count, 0)::numeric as constancy_points,

  i.official_exams_count,
  i.required_official_exams_count,
  i.optional_official_exams_count,
  i.official_exam_points_awarded,
  i.official_exam_max_points,
  coalesce(i.official_exam_points_awarded, 0::numeric) as exam_points,

  i.required_exams_count,
  i.completed_required_exams_count,
  i.missing_required_exams_count,
  i.is_ranking_eligible,

  i.admin_adjustment_movement_count,
  i.admin_adjustment_points,

  (
    coalesce(i.constancy_events_count, 0)::numeric
    + coalesce(i.official_exam_points_awarded, 0::numeric)
    + coalesce(i.admin_adjustment_points, 0)::numeric
  ) as competitive_score,

  i.first_event_date,
  i.last_event_date,
  i.last_exam_published_at,
  i.last_adjustment_at,
  i.has_competition_activity
from public.ucapsa_competition_inputs i;

comment on view public.ucapsa_competition_scores is
  'Puntaje competitivo derivado por perro y temporada: 1 punto por evento de Constancia + puntos oficiales de Exámenes + Ajustes Admin. No calcula Rango, posición ni Podio.';

revoke all on table public.ucapsa_competition_scores
  from public, anon, authenticated;
grant select on table public.ucapsa_competition_scores to authenticated;
grant select on table public.ucapsa_competition_scores to service_role;
