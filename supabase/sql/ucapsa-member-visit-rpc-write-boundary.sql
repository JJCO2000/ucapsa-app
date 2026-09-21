-- UCAPSA — version the production RPC-only write boundary for member visits
--
-- Production already exposes member_visits as SELECT-only to authenticated
-- clients. Keep that security boundary in the repository so future migrations
-- cannot accidentally restore direct INSERT/UPDATE/DELETE paths that bypass
-- temporal rules and audit RPCs.

revoke insert, update, delete
  on table public.member_visits
  from authenticated;

grant select
  on table public.member_visits
  to authenticated;

grant select, insert, update, delete
  on table public.member_visits
  to service_role;
