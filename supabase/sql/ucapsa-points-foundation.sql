-- UCAPSA Puntos — foundation only
--
-- IMPORTANT
-- 1) Versioned design for review. NOT applied remotely.
-- 2) Do not run until current remote schema/types are recaptured and reviewed.
-- 3) No automatic point awards are created here.
-- 4) MVP eligibility is members/Dog Club only, but the ledger is extensible.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Seasons
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_points_seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  eligibility_scope text not null default 'members' check (eligibility_scope in ('members', 'all_clients')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index if not exists ucapsa_points_one_active_season_idx
  on public.ucapsa_points_seasons ((status))
  where status = 'active';

create index if not exists ucapsa_points_seasons_dates_idx
  on public.ucapsa_points_seasons (starts_at desc, ends_at desc);

-- -----------------------------------------------------------------------------
-- Rules
-- Point values are configuration, never mobile-app constants.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_points_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.ucapsa_points_seasons(id) on delete cascade,
  code text not null,
  label text not null,
  source_type text not null check (source_type in (
    'member_visit',
    'class_attendance',
    'evaluation',
    'special_event',
    'admin_adjustment',
    'legacy_import'
  )),
  default_points integer not null default 0,
  is_active boolean not null default false,
  max_awards_per_day integer check (max_awards_per_day is null or max_awards_per_day > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, code)
);

create index if not exists ucapsa_points_rules_active_idx
  on public.ucapsa_points_rules (season_id, is_active, source_type);

-- -----------------------------------------------------------------------------
-- Season participants
-- One member + one representative dog per season.
-- The representative dog is locked once points begin; enforcement belongs in
-- reviewed server-side enrollment/award RPCs, not direct client writes.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_points_participants (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.ucapsa_points_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete restrict,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'disqualified')),
  visible_in_leaderboard boolean not null default true,
  joined_at timestamptz not null default now(),
  locked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, user_id),
  unique (season_id, dog_id),
  unique (id, season_id)
);

create index if not exists ucapsa_points_participants_season_status_idx
  on public.ucapsa_points_participants (season_id, status, visible_in_leaderboard);

create index if not exists ucapsa_points_participants_user_idx
  on public.ucapsa_points_participants (user_id, season_id desc);

-- -----------------------------------------------------------------------------
-- Tiers / seasonal medal ranges
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_points_tiers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.ucapsa_points_seasons(id) on delete cascade,
  code text not null,
  label text not null,
  min_points integer not null check (min_points >= 0),
  sort_order integer not null default 0,
  icon_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, code),
  unique (season_id, min_points)
);

create index if not exists ucapsa_points_tiers_lookup_idx
  on public.ucapsa_points_tiers (season_id, min_points desc);

-- -----------------------------------------------------------------------------
-- Append-only points ledger
-- Positive rows award points; negative rows correct/reverse them.
-- dedupe_key makes retries idempotent, e.g. member_visit:<visit_uuid>.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_points_ledger (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  participant_id uuid not null,
  rule_code text not null,
  source_type text not null check (source_type in (
    'member_visit',
    'class_attendance',
    'evaluation',
    'special_event',
    'admin_adjustment',
    'legacy_import'
  )),
  source_id text,
  dedupe_key text not null,
  points integer not null check (points <> 0),
  reason text not null,
  reversal_of_id uuid references public.ucapsa_points_ledger(id) on delete restrict,
  awarded_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ucapsa_points_ledger_participant_fk
    foreign key (participant_id, season_id)
    references public.ucapsa_points_participants(id, season_id)
    on delete restrict,
  constraint ucapsa_points_ledger_rule_fk
    foreign key (season_id, rule_code)
    references public.ucapsa_points_rules(season_id, code)
    on delete restrict,
  unique (season_id, dedupe_key)
);

create index if not exists ucapsa_points_ledger_participant_idx
  on public.ucapsa_points_ledger (season_id, participant_id, occurred_at desc);

create index if not exists ucapsa_points_ledger_source_idx
  on public.ucapsa_points_ledger (source_type, source_id);

create index if not exists ucapsa_points_ledger_created_idx
  on public.ucapsa_points_ledger (created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ucapsa_points_seasons_updated_at on public.ucapsa_points_seasons;
create trigger set_ucapsa_points_seasons_updated_at
before update on public.ucapsa_points_seasons
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists set_ucapsa_points_rules_updated_at on public.ucapsa_points_rules;
create trigger set_ucapsa_points_rules_updated_at
before update on public.ucapsa_points_rules
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists set_ucapsa_points_participants_updated_at on public.ucapsa_points_participants;
create trigger set_ucapsa_points_participants_updated_at
before update on public.ucapsa_points_participants
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists set_ucapsa_points_tiers_updated_at on public.ucapsa_points_tiers;
create trigger set_ucapsa_points_tiers_updated_at
before update on public.ucapsa_points_tiers
for each row execute function public.set_updated_at_timestamp();

-- -----------------------------------------------------------------------------
-- RLS
-- Raw leaderboard rows are not made broadly readable. A future RPC must return
-- safe presentation fields only (dog name, rank, points, tier, tie status).
-- -----------------------------------------------------------------------------

alter table public.ucapsa_points_seasons enable row level security;
alter table public.ucapsa_points_rules enable row level security;
alter table public.ucapsa_points_participants enable row level security;
alter table public.ucapsa_points_tiers enable row level security;
alter table public.ucapsa_points_ledger enable row level security;

drop policy if exists "Authenticated can read points seasons" on public.ucapsa_points_seasons;
create policy "Authenticated can read points seasons"
on public.ucapsa_points_seasons
for select
to authenticated
using (true);

drop policy if exists "Authenticated can read points tiers" on public.ucapsa_points_tiers;
create policy "Authenticated can read points tiers"
on public.ucapsa_points_tiers
for select
to authenticated
using (true);

drop policy if exists "Users can read own points participant" on public.ucapsa_points_participants;
create policy "Users can read own points participant"
on public.ucapsa_points_participants
for select
to authenticated
using (auth.uid() = user_id or public.is_ucapsa_admin());

drop policy if exists "Users can read own points ledger" on public.ucapsa_points_ledger;
create policy "Users can read own points ledger"
on public.ucapsa_points_ledger
for select
to authenticated
using (
  exists (
    select 1
    from public.ucapsa_points_participants p
    where p.id = ucapsa_points_ledger.participant_id
      and (p.user_id = auth.uid() or public.is_ucapsa_admin())
  )
);

drop policy if exists "Admins can read points rules" on public.ucapsa_points_rules;
create policy "Admins can read points rules"
on public.ucapsa_points_rules
for select
to authenticated
using (public.is_ucapsa_admin());

-- No insert/update/delete policies are created for points tables.
-- Enrollment, scoring, adjustments and imports must use reviewed server-side RPCs
-- or service_role so ownership, membership, dog selection and idempotency are
-- validated centrally.

-- -----------------------------------------------------------------------------
-- Deliberately NOT included in this foundation
-- -----------------------------------------------------------------------------
-- - no season seed
-- - no scoring values
-- - no tier thresholds
-- - no member_visits/program_attendances trigger
-- - no website ranking import
-- - no public leaderboard RPC
-- - no automatic badge award
-- - no remote application
