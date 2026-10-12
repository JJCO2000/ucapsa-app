-- Only published, required exams gate ranking. Zero required exams = no gate.
-- No points, attempts, standings or exam data are mutated.
create or replace view public.ucapsa_exam_eligibility
with (security_invoker = true)
as
with required as (
  select e.season_id, count(*)::bigint as required_exams_count
  from public.ucapsa_exams e
  where e.is_required_for_ranking is true
    and e.status = 'published'
  group by e.season_id
),
completed as (
  select r.season_id, r.dog_id, count(*)::bigint as completed_required_exams_count
  from public.ucapsa_exam_official_results r
  where r.is_required_for_ranking is true
  group by r.season_id, r.dog_id
)
select
  s.id as season_id,
  d.id as dog_id,
  coalesce(req.required_exams_count, 0)::bigint as required_exams_count,
  coalesce(done.completed_required_exams_count, 0)::bigint as completed_required_exams_count,
  greatest(
    coalesce(req.required_exams_count, 0) - coalesce(done.completed_required_exams_count, 0), 0
  )::bigint as missing_required_exams_count,
  (
    coalesce(done.completed_required_exams_count, 0) =
    coalesce(req.required_exams_count, 0)
  ) as is_ranking_eligible
from public.ucapsa_competition_seasons s
cross join public.dogs d
left join required req on req.season_id = s.id
left join completed done on done.season_id = s.id and done.dog_id = d.id
where s.status <> 'draft';

comment on view public.ucapsa_exam_eligibility is
  'Ranking: elegible si cumple todos los examenes obligatorios publicados; cero obligatorios no bloquea.';

revoke all privileges on public.ucapsa_exam_eligibility from public, anon, authenticated;
grant select on public.ucapsa_exam_eligibility to authenticated;
grant select on public.ucapsa_exam_eligibility to service_role;
