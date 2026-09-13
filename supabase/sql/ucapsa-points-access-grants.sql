-- UCAPSA Puntos — authenticated read/execute grants
-- Applied remotely on 2026-09-13 after the first Preview client exposed that
-- RLS policies existed but PostgreSQL table privileges had never been granted.
-- RLS remains authoritative: grants only let authenticated requests reach it.

grant select on table public.ucapsa_points_seasons to authenticated;
grant select on table public.ucapsa_points_rules to authenticated;
grant select on table public.ucapsa_points_participants to authenticated;
grant select on table public.ucapsa_points_tiers to authenticated;
grant select on table public.ucapsa_points_ledger to authenticated;

grant execute on function public.get_ucapsa_points_leaderboard(integer) to authenticated;
grant execute on function public.admin_adjust_ucapsa_points(uuid, uuid, integer, text) to authenticated;

-- Members may read active scoring rules so the app can explain how points are
-- earned. Admins may also inspect inactive rules while configuring a season.
drop policy if exists "Admins can read points rules" on public.ucapsa_points_rules;
drop policy if exists "Authenticated can read active points rules" on public.ucapsa_points_rules;
create policy "Authenticated can read active points rules"
on public.ucapsa_points_rules
for select
to authenticated
using (is_active or public.is_ucapsa_admin());
