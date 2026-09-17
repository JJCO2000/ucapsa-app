-- UCAPSA Rango 1 — access/security/performance hardening
-- Applied remotely after reviewing the structural foundation with Supabase advisors.
-- Keeps authenticated clients read-only behind RLS, removes RPC exposure from
-- trigger-only validators, and covers the foreign keys introduced by Rango 1.

-- Trigger-only validators do not need SECURITY DEFINER or RPC exposure.
alter function public.ucapsa_validate_member_visit_dog_owner() security invoker;
alter function public.ucapsa_validate_exam_item_result() security invoker;
revoke all on function public.ucapsa_validate_member_visit_dog_owner() from public, anon, authenticated;
revoke all on function public.ucapsa_validate_exam_item_result() from public, anon, authenticated;

-- SQL-created tables: expose only the reads the app needs. RLS remains authoritative.
revoke all privileges on table
  public.ucapsa_competition_seasons,
  public.member_visit_dogs,
  public.ucapsa_exams,
  public.ucapsa_exam_items,
  public.ucapsa_import_batches,
  public.ucapsa_exam_attempts,
  public.ucapsa_exam_item_results,
  public.ucapsa_competition_adjustments,
  public.ucapsa_award_definitions,
  public.dog_awards
from anon, authenticated;

grant select on table
  public.ucapsa_competition_seasons,
  public.member_visit_dogs,
  public.ucapsa_exams,
  public.ucapsa_exam_items,
  public.ucapsa_import_batches,
  public.ucapsa_exam_attempts,
  public.ucapsa_exam_item_results,
  public.ucapsa_competition_adjustments,
  public.ucapsa_award_definitions,
  public.dog_awards
to authenticated;

grant select, insert, update, delete on table
  public.ucapsa_competition_seasons,
  public.member_visit_dogs,
  public.ucapsa_exams,
  public.ucapsa_exam_items,
  public.ucapsa_import_batches,
  public.ucapsa_exam_attempts,
  public.ucapsa_exam_item_results,
  public.ucapsa_competition_adjustments,
  public.ucapsa_award_definitions,
  public.dog_awards
to service_role;

-- RLS init-plan optimization for the Rango 1 policies.
drop policy if exists "Users read own member visit dogs" on public.member_visit_dogs;
create policy "Users read own member visit dogs"
on public.member_visit_dogs
for select to authenticated
using (
  (select public.is_ucapsa_admin())
  or exists (
    select 1 from public.dogs d
    where d.id = member_visit_dogs.dog_id
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists "Authenticated read published exams" on public.ucapsa_exams;
create policy "Authenticated read published exams"
on public.ucapsa_exams
for select to authenticated
using (status = 'published' or (select public.is_ucapsa_admin()));

drop policy if exists "Authenticated read published exam items" on public.ucapsa_exam_items;
create policy "Authenticated read published exam items"
on public.ucapsa_exam_items
for select to authenticated
using (
  (select public.is_ucapsa_admin())
  or exists (
    select 1 from public.ucapsa_exams e
    where e.id = ucapsa_exam_items.exam_id
      and e.status = 'published'
  )
);

drop policy if exists "Admins read import batches" on public.ucapsa_import_batches;
create policy "Admins read import batches"
on public.ucapsa_import_batches
for select to authenticated
using ((select public.is_ucapsa_admin()));

drop policy if exists "Users read own official exam attempts" on public.ucapsa_exam_attempts;
create policy "Users read own official exam attempts"
on public.ucapsa_exam_attempts
for select to authenticated
using (
  (select public.is_ucapsa_admin())
  or (
    status = 'published'
    and is_official = true
    and exists (
      select 1 from public.dogs d
      where d.id = ucapsa_exam_attempts.dog_id
        and d.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Users read own official exam item results" on public.ucapsa_exam_item_results;
create policy "Users read own official exam item results"
on public.ucapsa_exam_item_results
for select to authenticated
using (
  (select public.is_ucapsa_admin())
  or exists (
    select 1
    from public.ucapsa_exam_attempts a
    join public.dogs d on d.id = a.dog_id
    where a.id = ucapsa_exam_item_results.attempt_id
      and a.status = 'published'
      and a.is_official = true
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists "Users read own competition adjustments" on public.ucapsa_competition_adjustments;
create policy "Users read own competition adjustments"
on public.ucapsa_competition_adjustments
for select to authenticated
using (
  (select public.is_ucapsa_admin())
  or exists (
    select 1 from public.dogs d
    where d.id = ucapsa_competition_adjustments.dog_id
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists "Authenticated read award definitions" on public.ucapsa_award_definitions;
create policy "Authenticated read award definitions"
on public.ucapsa_award_definitions
for select to authenticated
using (is_active = true or (select public.is_ucapsa_admin()));

drop policy if exists "Users read own dog awards" on public.dog_awards;
create policy "Users read own dog awards"
on public.dog_awards
for select to authenticated
using (
  (select public.is_ucapsa_admin())
  or exists (
    select 1 from public.dogs d
    where d.id = dog_awards.dog_id
      and d.user_id = (select auth.uid())
  )
);

-- Cover every FK introduced by Rango 1 that is not already leftmost-covered.
create index if not exists member_visit_dogs_credited_by_idx
  on public.member_visit_dogs (credited_by) where credited_by is not null;
create index if not exists ucapsa_competition_seasons_created_by_idx
  on public.ucapsa_competition_seasons (created_by) where created_by is not null;
create index if not exists ucapsa_competition_seasons_closed_by_idx
  on public.ucapsa_competition_seasons (closed_by) where closed_by is not null;
create index if not exists ucapsa_exams_created_by_idx
  on public.ucapsa_exams (created_by) where created_by is not null;
create index if not exists ucapsa_exams_published_by_idx
  on public.ucapsa_exams (published_by) where published_by is not null;
create index if not exists ucapsa_import_batches_exam_idx
  on public.ucapsa_import_batches (exam_id) where exam_id is not null;
create index if not exists ucapsa_import_batches_created_by_idx
  on public.ucapsa_import_batches (created_by);
create index if not exists ucapsa_exam_attempts_import_batch_idx
  on public.ucapsa_exam_attempts (import_batch_id) where import_batch_id is not null;
create index if not exists ucapsa_exam_attempts_created_by_idx
  on public.ucapsa_exam_attempts (created_by) where created_by is not null;
create index if not exists ucapsa_exam_attempts_reviewed_by_idx
  on public.ucapsa_exam_attempts (reviewed_by) where reviewed_by is not null;
create index if not exists ucapsa_exam_attempts_published_by_idx
  on public.ucapsa_exam_attempts (published_by) where published_by is not null;
create index if not exists ucapsa_exam_attempts_voided_by_idx
  on public.ucapsa_exam_attempts (voided_by) where voided_by is not null;
create index if not exists ucapsa_exam_item_results_updated_by_idx
  on public.ucapsa_exam_item_results (updated_by) where updated_by is not null;
create index if not exists ucapsa_competition_adjustments_dog_only_idx
  on public.ucapsa_competition_adjustments (dog_id);
create index if not exists ucapsa_competition_adjustments_created_by_idx
  on public.ucapsa_competition_adjustments (created_by);
create index if not exists ucapsa_competition_adjustments_reversal_idx
  on public.ucapsa_competition_adjustments (reversal_of_id) where reversal_of_id is not null;
create index if not exists dog_awards_award_code_idx
  on public.dog_awards (award_code);
create index if not exists dog_awards_season_idx
  on public.dog_awards (season_id) where season_id is not null;
create index if not exists dog_awards_awarded_by_idx
  on public.dog_awards (awarded_by) where awarded_by is not null;
create index if not exists dog_awards_revoked_by_idx
  on public.dog_awards (revoked_by) where revoked_by is not null;
