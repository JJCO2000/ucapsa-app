-- UCAPSA RLS redundancy cleanup.
--
-- Removes only policies proven redundant in the live schema.
-- No authorization path is removed:
-- - class cancellations keep the generic public SELECT policy;
-- - payments keep payments_admin_all;
-- - memberships keep memberships_select_own_or_admin.

drop policy if exists "program_class_cancellations_public_calendar_select"
  on public.program_class_cancellations;

drop policy if exists "payments_admin_delete"
  on public.payments;

drop policy if exists "memberships_admin_select"
  on public.memberships;
