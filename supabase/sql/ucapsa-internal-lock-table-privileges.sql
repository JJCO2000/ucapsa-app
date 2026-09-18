-- UCAPSA internal notification lock-table privilege hardening.
--
-- These tables are implementation locks for Edge Functions. They intentionally
-- have RLS with no client policies and are accessed only through service_role.

revoke all on table public.notification_class_reminder_locks
  from public, anon, authenticated;

revoke all on table public.notification_class_cancellation_locks
  from public, anon, authenticated;

-- Preserve the only privileges used by the Edge Functions explicitly.
grant select, insert, update on table public.notification_class_reminder_locks
  to service_role;

grant select, insert, update on table public.notification_class_cancellation_locks
  to service_role;
