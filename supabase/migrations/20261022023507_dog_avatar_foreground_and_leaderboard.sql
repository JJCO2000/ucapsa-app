-- Visual personalization only. Existing avatars keep their automatic foreground.
-- Apply BEFORE client code that writes avatar_foreground_color.
BEGIN;
ALTER TABLE public.dogs
  ADD COLUMN IF NOT EXISTS avatar_foreground_color text NULL;
ALTER TABLE public.dogs
  DROP CONSTRAINT IF EXISTS dogs_avatar_foreground_allowed;
ALTER TABLE public.dogs
  ADD CONSTRAINT dogs_avatar_foreground_allowed CHECK (
    avatar_foreground_color IS NULL OR avatar_foreground_color IN (
      '#4B2C20','#FFFFFF','#7A151E','#3C6FC9','#4D857A','#D4A62A'
    )
  );
-- Existing owner-based RLS remains effective; no cross-user grants.
GRANT UPDATE (avatar_foreground_color) ON public.dogs TO authenticated;

-- Same scoring, ordering, columns and privacy as the existing canonical view.
-- Postgres allows only ADDING a final column with CREATE OR REPLACE VIEW.
CREATE OR REPLACE VIEW public.ucapsa_competition_leaderboard AS
SELECT r.season_id, r.season_code, r.season_name, r.season_status,
 r.season_starts_at, r.season_ends_at,
 row_number() OVER (
  PARTITION BY r.season_id
  ORDER BY coalesce(r.competitive_score,0::numeric) DESC,
           coalesce(r.command_attendances_count,0::bigint) DESC,
           coalesce(r.exam_points,0::numeric) DESC,
           r.dog_id
 ) AS ranking_position,
 count(*) OVER (PARTITION BY r.season_id) AS eligible_dogs_count,
 r.dog_id,r.dog_name,r.dog_is_active,r.competitive_score,r.constancy_points,
 r.command_attendances_count,r.member_visits_count,r.exam_points,
 r.admin_adjustment_points,r.required_exams_count,
 r.completed_required_exams_count,r.missing_required_exams_count,
 r.constancy_percentile,r.range_code,r.range_name,r.range_level,
 r.last_event_date,r.last_exam_published_at,r.last_adjustment_at,
 r.is_constancy_outstanding,r.constancy_population_count,
 r.has_sufficient_constancy_population,
 d.avatar_key AS dog_avatar_key,
 d.avatar_color AS dog_avatar_color,
 d.avatar_foreground_color AS dog_avatar_foreground_color
FROM public.ucapsa_competition_ranges r
JOIN public.dogs d ON d.id=r.dog_id
WHERE r.is_ranking_eligible IS TRUE;
COMMIT;
