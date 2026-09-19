-- UCAPSA Rango 1 — client leaderboard draft-season visibility hardening.
--
-- The client RPC is SECURITY DEFINER so it must enforce the same product
-- visibility rule as the client UI: draft seasons are not readable through
-- the public competition leaderboard API.

create or replace function public.get_ucapsa_competition_leaderboard(
  p_season_id uuid
)
returns setof public.ucapsa_competition_leaderboard
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.*
  from public.ucapsa_competition_leaderboard l
  where l.season_id = p_season_id
    and l.season_status <> 'draft'
  order by l.ranking_position asc;
$$;

comment on function public.get_ucapsa_competition_leaderboard(uuid) is
  'Leaderboard cliente seguro: sólo temporadas no draft y sólo columnas competitivas; no owner_user_id ni datos privados del dueño.';

revoke all on function public.get_ucapsa_competition_leaderboard(uuid)
  from public, anon, authenticated;
grant execute on function public.get_ucapsa_competition_leaderboard(uuid)
  to authenticated;
grant execute on function public.get_ucapsa_competition_leaderboard(uuid)
  to service_role;
