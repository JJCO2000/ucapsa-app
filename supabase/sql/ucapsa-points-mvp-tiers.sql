-- UCAPSA Puntos — MVP medal thresholds
-- Bronce: 10 pts · Plata: 25 pts · Oro: 50 pts
-- Idempotent seed for the active 2026 season.

begin;

do $$
declare
  v_season_id uuid;
begin
  select id
    into v_season_id
  from public.ucapsa_points_seasons
  where code = '2026'
  limit 1;

  if v_season_id is null then
    raise exception 'ucapsa_points season 2026 does not exist';
  end if;

  insert into public.ucapsa_points_tiers (
    season_id,
    code,
    label,
    min_points,
    sort_order,
    icon_key,
    metadata
  ) values
    (v_season_id, 'bronze', 'Bronce', 10, 10, 'medal-bronze', jsonb_build_object('mvp', true)),
    (v_season_id, 'silver', 'Plata', 25, 20, 'medal-silver', jsonb_build_object('mvp', true)),
    (v_season_id, 'gold', 'Oro', 50, 30, 'medal-gold', jsonb_build_object('mvp', true))
  on conflict (season_id, code) do update
  set
    label = excluded.label,
    min_points = excluded.min_points,
    sort_order = excluded.sort_order,
    icon_key = excluded.icon_key,
    metadata = excluded.metadata;
end $$;

commit;
