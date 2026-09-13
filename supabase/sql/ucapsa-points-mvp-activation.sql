-- UCAPSA Puntos — MVP activation
--
-- PRECONDITION:
--   Run/review `ucapsa-points-foundation.sql` first. This file assumes the
--   ucapsa_points_* tables already exist.
--
-- MVP RULES:
--   * only active UCAPSA members participate;
--   * every confirmed program attendance inserted from the cut-over date onward
--     awards exactly 1 point;
--   * admins may add or subtract arbitrary points manually with a mandatory reason;
--   * no member-visit, evaluation or special-event points are automatic yet;
--   * no historical attendance backfill is performed by this script;
--   * if a member has no participant yet, the first scored attendance chooses the
--     enrollment dog as the season representative and locks it for that season.
--
-- CUT-OVER:
--   2026-09-13. This avoids silently mixing the existing website leaderboard with
--   a new scoring engine. Existing website points can be reconciled explicitly by
--   admin adjustments/import before publishing the leaderboard.

begin;

-- -----------------------------------------------------------------------------
-- 1. Active MVP season
-- -----------------------------------------------------------------------------

insert into public.ucapsa_points_seasons (
  code,
  name,
  starts_at,
  ends_at,
  status,
  eligibility_scope,
  metadata
)
values (
  '2026',
  'Perro del Año 2026',
  '2026-09-13 00:00:00-06'::timestamptz,
  '2027-01-01 00:00:00-06'::timestamptz,
  'active',
  'members',
  jsonb_build_object(
    'mvp_cutover', '2026-09-13',
    'website_reconciliation_pending', true,
    'attendance_points', 1
  )
)
on conflict (code) do update
set
  name = excluded.name,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  status = excluded.status,
  eligibility_scope = excluded.eligibility_scope,
  metadata = coalesce(public.ucapsa_points_seasons.metadata, '{}'::jsonb) || excluded.metadata;

-- -----------------------------------------------------------------------------
-- 2. MVP point rules
-- -----------------------------------------------------------------------------

do $$
declare
  v_season_id uuid;
begin
  select id
    into v_season_id
  from public.ucapsa_points_seasons
  where code = '2026';

  insert into public.ucapsa_points_rules (
    season_id, code, label, source_type, default_points, is_active, max_awards_per_day, metadata
  ) values
    (
      v_season_id,
      'class_attendance',
      'Asistencia a clase',
      'class_attendance',
      1,
      true,
      null,
      jsonb_build_object('mvp', true)
    ),
    (
      v_season_id,
      'admin_adjustment',
      'Ajuste manual',
      'admin_adjustment',
      0,
      true,
      null,
      jsonb_build_object('mvp', true, 'reason_required', true)
    ),
    (
      v_season_id,
      'member_visit',
      'Visita de socio',
      'member_visit',
      0,
      false,
      null,
      jsonb_build_object('reserved_for_future', true)
    ),
    (
      v_season_id,
      'evaluation',
      'Evaluación',
      'evaluation',
      0,
      false,
      null,
      jsonb_build_object('reserved_for_future', true)
    ),
    (
      v_season_id,
      'special_event',
      'Evento especial',
      'special_event',
      0,
      false,
      null,
      jsonb_build_object('reserved_for_future', true)
    )
  on conflict (season_id, code) do update
  set
    label = excluded.label,
    source_type = excluded.source_type,
    default_points = excluded.default_points,
    is_active = excluded.is_active,
    max_awards_per_day = excluded.max_awards_per_day,
    metadata = excluded.metadata;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Internal helper: get/create the member's participant for the active season.
--    First valid attendance chooses the representative dog in this MVP.
-- -----------------------------------------------------------------------------

create or replace function public.ensure_ucapsa_points_participant(
  p_user_id uuid,
  p_dog_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_participant_id uuid;
  v_dog_name text;
begin
  if p_user_id is null or p_dog_id is null then
    return null;
  end if;

  select id
    into v_season_id
  from public.ucapsa_points_seasons
  where status = 'active'
    and now() >= starts_at
    and now() < ends_at
  order by starts_at desc
  limit 1;

  if v_season_id is null then
    return null;
  end if;

  select id
    into v_participant_id
  from public.ucapsa_points_participants
  where season_id = v_season_id
    and user_id = p_user_id
  limit 1;

  if v_participant_id is not null then
    return v_participant_id;
  end if;

  select name
    into v_dog_name
  from public.dogs
  where id = p_dog_id
    and user_id = p_user_id
    and is_active = true;

  if v_dog_name is null then
    return null;
  end if;

  insert into public.ucapsa_points_participants (
    season_id,
    user_id,
    dog_id,
    display_name,
    status,
    visible_in_leaderboard,
    locked_at,
    metadata
  ) values (
    v_season_id,
    p_user_id,
    p_dog_id,
    v_dog_name,
    'active',
    true,
    now(),
    jsonb_build_object('mvp_auto_enrolled', true)
  )
  on conflict (season_id, user_id) do update
    set updated_at = now()
  returning id into v_participant_id;

  if v_participant_id is null then
    select id
      into v_participant_id
    from public.ucapsa_points_participants
    where season_id = v_season_id
      and user_id = p_user_id
    limit 1;
  end if;

  return v_participant_id;
end;
$$;

revoke all on function public.ensure_ucapsa_points_participant(uuid, uuid) from public;
revoke all on function public.ensure_ucapsa_points_participant(uuid, uuid) from anon;
revoke all on function public.ensure_ucapsa_points_participant(uuid, uuid) from authenticated;

-- -----------------------------------------------------------------------------
-- 4. Automatic scoring: +1 for each confirmed program attendance.
--    Important: scoring failures must not invalidate the attendance itself.
-- -----------------------------------------------------------------------------

create or replace function public.award_ucapsa_point_for_program_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_dog_id uuid;
  v_season_id uuid;
  v_participant_id uuid;
  v_points integer;
  v_attendance_ts timestamptz;
begin
  -- The attendance row itself is the source of truth. One ledger entry per
  -- attendance UUID makes retries idempotent.
  select e.user_id, e.dog_id
    into v_user_id, v_dog_id
  from public.program_enrollments e
  where e.id = new.enrollment_id;

  if v_user_id is null or v_dog_id is null then
    return new;
  end if;

  v_attendance_ts := coalesce(new.recorded_at, new.created_at, now());

  select s.id
    into v_season_id
  from public.ucapsa_points_seasons s
  where s.status = 'active'
    and v_attendance_ts >= s.starts_at
    and v_attendance_ts < s.ends_at
  order by s.starts_at desc
  limit 1;

  if v_season_id is null then
    return new;
  end if;

  -- MVP is members only. Membership must have been valid on the attendance date.
  if not exists (
    select 1
    from public.memberships m
    where m.user_id = v_user_id
      and m.status = 'active'
      and (m.start_date is null or m.start_date::date <= new.attendance_date)
      and (m.end_date is null or m.end_date::date >= new.attendance_date)
  ) then
    return new;
  end if;

  select r.default_points
    into v_points
  from public.ucapsa_points_rules r
  where r.season_id = v_season_id
    and r.code = 'class_attendance'
    and r.source_type = 'class_attendance'
    and r.is_active = true
  limit 1;

  if coalesce(v_points, 0) = 0 then
    return new;
  end if;

  v_participant_id := public.ensure_ucapsa_points_participant(v_user_id, v_dog_id);
  if v_participant_id is null then
    return new;
  end if;

  insert into public.ucapsa_points_ledger (
    season_id,
    participant_id,
    rule_code,
    source_type,
    source_id,
    dedupe_key,
    points,
    reason,
    awarded_by,
    occurred_at,
    metadata
  ) values (
    v_season_id,
    v_participant_id,
    'class_attendance',
    'class_attendance',
    new.id::text,
    'class_attendance:' || new.id::text,
    v_points,
    'Asistencia confirmada',
    new.marked_by,
    v_attendance_ts,
    jsonb_build_object(
      'enrollment_id', new.enrollment_id,
      'attendance_date', new.attendance_date,
      'source', new.source,
      'outside_window', new.outside_window
    )
  )
  on conflict (season_id, dedupe_key) do nothing;

  return new;
exception
  when others then
    -- Gamification must never make attendance registration fail.
    raise warning 'UCAPSA points attendance award failed for attendance %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.award_ucapsa_point_for_program_attendance() from public;
revoke all on function public.award_ucapsa_point_for_program_attendance() from anon;
revoke all on function public.award_ucapsa_point_for_program_attendance() from authenticated;

drop trigger if exists award_ucapsa_point_after_program_attendance on public.program_attendances;
create trigger award_ucapsa_point_after_program_attendance
after insert on public.program_attendances
for each row
execute function public.award_ucapsa_point_for_program_attendance();

-- -----------------------------------------------------------------------------
-- 5. Admin RPC: arbitrary manual bonus/correction with mandatory reason.
--    Positive adds points; negative corrects/removes points.
-- -----------------------------------------------------------------------------

create or replace function public.admin_adjust_ucapsa_points(
  p_user_id uuid,
  p_dog_id uuid,
  p_points integer,
  p_reason text
)
returns table (
  ledger_id uuid,
  participant_id uuid,
  total_points bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_participant_id uuid;
  v_ledger_id uuid;
  v_total bigint;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id is null or p_dog_id is null then
    raise exception 'user_and_dog_required' using errcode = '22023';
  end if;

  if p_points is null or p_points = 0 then
    raise exception 'points_must_be_non_zero' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.user_id = p_user_id
      and m.status = 'active'
      and (m.start_date is null or m.start_date::date <= current_date)
      and (m.end_date is null or m.end_date::date >= current_date)
  ) then
    raise exception 'active_membership_required' using errcode = '22023';
  end if;

  select id
    into v_season_id
  from public.ucapsa_points_seasons
  where status = 'active'
    and now() >= starts_at
    and now() < ends_at
  order by starts_at desc
  limit 1;

  if v_season_id is null then
    raise exception 'no_active_points_season' using errcode = '22023';
  end if;

  v_participant_id := public.ensure_ucapsa_points_participant(p_user_id, p_dog_id);
  if v_participant_id is null then
    raise exception 'participant_could_not_be_created' using errcode = '22023';
  end if;

  insert into public.ucapsa_points_ledger (
    season_id,
    participant_id,
    rule_code,
    source_type,
    source_id,
    dedupe_key,
    points,
    reason,
    awarded_by,
    occurred_at,
    metadata
  ) values (
    v_season_id,
    v_participant_id,
    'admin_adjustment',
    'admin_adjustment',
    null,
    'admin_adjustment:' || gen_random_uuid()::text,
    p_points,
    trim(p_reason),
    auth.uid(),
    now(),
    jsonb_build_object('mvp', true)
  )
  returning id into v_ledger_id;

  insert into public.admin_audit_logs (
    action,
    admin_user_id,
    entity_type,
    entity_id,
    details
  ) values (
    'ucapsa_points_adjustment',
    auth.uid(),
    'ucapsa_points_participant',
    v_participant_id::text,
    jsonb_build_object(
      'user_id', p_user_id,
      'dog_id', p_dog_id,
      'points', p_points,
      'reason', trim(p_reason),
      'ledger_id', v_ledger_id
    )
  );

  select coalesce(sum(l.points), 0)::bigint
    into v_total
  from public.ucapsa_points_ledger l
  where l.season_id = v_season_id
    and l.participant_id = v_participant_id;

  return query
  select v_ledger_id, v_participant_id, v_total;
end;
$$;

revoke all on function public.admin_adjust_ucapsa_points(uuid, uuid, integer, text) from public;
revoke all on function public.admin_adjust_ucapsa_points(uuid, uuid, integer, text) from anon;
grant execute on function public.admin_adjust_ucapsa_points(uuid, uuid, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Safe leaderboard RPC for the app.
--    Returns dog presentation fields only; no owner PII.
-- -----------------------------------------------------------------------------

create or replace function public.get_ucapsa_points_leaderboard(
  p_limit integer default 50
)
returns table (
  rank bigint,
  dog_id uuid,
  display_name text,
  total_points bigint,
  tier_code text,
  tier_label text,
  is_current_user boolean,
  is_tied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_limit integer := greatest(3, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not public.is_ucapsa_admin() and not exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and (m.start_date is null or m.start_date::date <= current_date)
      and (m.end_date is null or m.end_date::date >= current_date)
  ) then
    raise exception 'active_membership_required' using errcode = '42501';
  end if;

  select id
    into v_season_id
  from public.ucapsa_points_seasons
  where status = 'active'
    and now() >= starts_at
    and now() < ends_at
  order by starts_at desc
  limit 1;

  if v_season_id is null then
    return;
  end if;

  return query
  with totals as (
    select
      p.id as participant_id,
      p.user_id,
      p.dog_id,
      p.display_name,
      coalesce(sum(l.points), 0)::bigint as total_points
    from public.ucapsa_points_participants p
    left join public.ucapsa_points_ledger l
      on l.season_id = p.season_id
     and l.participant_id = p.id
    where p.season_id = v_season_id
      and p.status = 'active'
      and p.visible_in_leaderboard = true
    group by p.id, p.user_id, p.dog_id, p.display_name
  ), ranked as (
    select
      t.*,
      dense_rank() over (order by t.total_points desc) as rank,
      count(*) over (partition by t.total_points) > 1 as is_tied
    from totals t
  )
  select
    r.rank,
    r.dog_id,
    r.display_name,
    r.total_points,
    tier.code as tier_code,
    tier.label as tier_label,
    r.user_id = auth.uid() as is_current_user,
    r.is_tied
  from ranked r
  left join lateral (
    select t.code, t.label
    from public.ucapsa_points_tiers t
    where t.season_id = v_season_id
      and t.min_points <= r.total_points
    order by t.min_points desc
    limit 1
  ) tier on true
  order by r.rank asc, r.display_name asc
  limit v_limit;
end;
$$;

revoke all on function public.get_ucapsa_points_leaderboard(integer) from public;
revoke all on function public.get_ucapsa_points_leaderboard(integer) from anon;
grant execute on function public.get_ucapsa_points_leaderboard(integer) to authenticated;

commit;

-- -----------------------------------------------------------------------------
-- Manual admin usage example (run while authenticated as an admin in the app):
--
-- select * from public.admin_adjust_ucapsa_points(
--   '<USER_UUID>'::uuid,
--   '<DOG_UUID>'::uuid,
--   5,
--   'Bono por evento especial'
-- );
--
-- A correction can use a negative amount, e.g. -2, with a reason.
-- -----------------------------------------------------------------------------
