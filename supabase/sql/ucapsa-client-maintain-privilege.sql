-- UCAPSA client MAINTAIN privilege hardening.
--
-- PostgreSQL 17+ MAINTAIN permits operational maintenance commands that client
-- roles do not need. Keep CRUD and RLS unchanged.

revoke maintain
  on all tables in schema public
  from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke maintain on tables
  from anon, authenticated;

-- Managed Supabase boundary:
-- postgres cannot alter supabase_admin-owned defaults. All current UCAPSA
-- public tables are postgres-owned, so existing data tables are covered.
