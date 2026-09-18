-- UCAPSA RLS SELECT-overlap cleanup.
--
-- Preserve exactly the same access model while removing redundant SELECT work
-- from admin ALL policies. Canonical SELECT policies remain untouched except
-- Programas/Horarios public-calendar policies, which become anon-only because
-- authenticated already has an active-or-admin SELECT policy.

-- member_visits
drop policy if exists "member_visits_admin_all" on public.member_visits;
create policy "member_visits_admin_insert"
  on public.member_visits for insert to authenticated
  with check (public.is_admin());
create policy "member_visits_admin_update"
  on public.member_visits for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "member_visits_admin_delete"
  on public.member_visits for delete to authenticated
  using (public.is_admin());

-- membership_billing_profiles
drop policy if exists "membership_billing_profiles_admin_all" on public.membership_billing_profiles;
create policy "membership_billing_profiles_admin_insert"
  on public.membership_billing_profiles for insert to authenticated
  with check (public.is_admin());
create policy "membership_billing_profiles_admin_update"
  on public.membership_billing_profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "membership_billing_profiles_admin_delete"
  on public.membership_billing_profiles for delete to authenticated
  using (public.is_admin());

-- payment_obligations
drop policy if exists "payment_obligations_admin_all" on public.payment_obligations;
create policy "payment_obligations_admin_insert"
  on public.payment_obligations for insert to authenticated
  with check (public.is_admin());
create policy "payment_obligations_admin_update"
  on public.payment_obligations for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "payment_obligations_admin_delete"
  on public.payment_obligations for delete to authenticated
  using (public.is_admin());

-- payments
drop policy if exists "payments_admin_all" on public.payments;
create policy "payments_admin_insert"
  on public.payments for insert to authenticated
  with check (public.is_admin());
create policy "payments_admin_update"
  on public.payments for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "payments_admin_delete_v2"
  on public.payments for delete to authenticated
  using (public.is_admin());

-- user_achievements
drop policy if exists "user_achievements_admin_all" on public.user_achievements;
create policy "user_achievements_admin_insert"
  on public.user_achievements for insert to authenticated
  with check (public.is_admin());
create policy "user_achievements_admin_update"
  on public.user_achievements for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "user_achievements_admin_delete"
  on public.user_achievements for delete to authenticated
  using (public.is_admin());

-- program_schedule_versions
drop policy if exists "program_schedule_versions_admin_write" on public.program_schedule_versions;
create policy "program_schedule_versions_admin_insert"
  on public.program_schedule_versions for insert to authenticated
  with check (public.is_admin());
create policy "program_schedule_versions_admin_update"
  on public.program_schedule_versions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "program_schedule_versions_admin_delete"
  on public.program_schedule_versions for delete to authenticated
  using (public.is_admin());

-- program_sessions
drop policy if exists "program_sessions_admin_all" on public.program_sessions;
create policy "program_sessions_admin_insert"
  on public.program_sessions for insert to authenticated
  with check (public.is_admin());
create policy "program_sessions_admin_update"
  on public.program_sessions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "program_sessions_admin_delete"
  on public.program_sessions for delete to authenticated
  using (public.is_admin());

-- programs
alter policy "programs_public_calendar_select"
  on public.programs
  to anon;
drop policy if exists "programs_admin_all" on public.programs;
create policy "programs_admin_insert"
  on public.programs for insert to authenticated
  with check (public.is_admin());
create policy "programs_admin_update"
  on public.programs for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "programs_admin_delete"
  on public.programs for delete to authenticated
  using (public.is_admin());

-- program_schedules
alter policy "program_schedules_public_calendar_select"
  on public.program_schedules
  to anon;
drop policy if exists "program_schedules_admin_all" on public.program_schedules;
create policy "program_schedules_admin_insert"
  on public.program_schedules for insert to authenticated
  with check (public.is_admin());
create policy "program_schedules_admin_update"
  on public.program_schedules for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "program_schedules_admin_delete"
  on public.program_schedules for delete to authenticated
  using (public.is_admin());
