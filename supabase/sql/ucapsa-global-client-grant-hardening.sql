-- UCAPSA global client-role privilege hardening.
--
-- Scope is intentionally narrow:
-- - remove TRUNCATE / REFERENCES / TRIGGER from anon/authenticated;
-- - keep SELECT / INSERT / UPDATE / DELETE unchanged;
-- - keep RLS unchanged;
-- - fix defaults for migrations created by postgres.
--
-- Managed Supabase note:
-- public tables currently owned by postgres are fully covered here.
-- The migration runner is postgres and is not a member of supabase_admin, so it
-- cannot change supabase_admin-owned default privileges. Do not fake success:
-- that platform-owned default remains an external boundary to re-check after
-- schema changes created outside the repo migration path.

revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables
  from anon, authenticated;
