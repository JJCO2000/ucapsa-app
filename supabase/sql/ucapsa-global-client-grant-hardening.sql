-- UCAPSA global client-role privilege hardening.
--
-- Scope is intentionally narrow:
-- - remove TRUNCATE / REFERENCES / TRIGGER from anon/authenticated;
-- - keep SELECT / INSERT / UPDATE / DELETE unchanged;
-- - keep RLS unchanged;
-- - fix defaults for both roles that can own/create public tables.

revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables
  from anon, authenticated;

alter default privileges for role supabase_admin in schema public
  revoke truncate, references, trigger on tables
  from anon, authenticated;
