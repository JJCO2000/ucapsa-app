-- UCAPSA Puntos — foundation only
--
-- IMPORTANT:
-- 1) This file is a versioned design for review. It has NOT been applied remotely.
-- 2) Do not run it until the current remote schema/types have been recaptured and reviewed.
-- 3) This phase intentionally creates no automatic trigger on member_visits and awards no points.
-- 4) MVP scope is members/Dog Club only, but the ledger is extensible to future sources.

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
-- Scoring rules. Values are data, not app constants.
-- Known future rule codes can exist while disabled with 0 points.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_points_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.ucapsa_points_seasons(id) on delete cascade,
  code text not null,
  label text not null,
  source_type text not null,
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
-- Participant presentation.
-- Points belong to the member account (user_id). leaderboard_dog_id is only the
-- representative dog shown in "Perro del Año"; this avoids inventing which dog
-- receives a member visit when one account owns multiple dogs.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_points_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  leaderboard_dog_id uuid references public.dogs(id) on delete set null,
  is_participating boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ucapsa_points_profiles_dog_idx
  on public.ucapsa_points_profiles (leaderboard_dog_id);

-- -----------------------------------------------------------------------------
-- Medal tiers are derived from total points and configurable per season.
-- Do not hard-code 100/200/300 in the mobile app.
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
-- Append-only ledger. This is the source of truth for totals.
-- Positive rows add points; negative rows correct/reverse points.
-- dedupe_key makes retries idempotent, e.g. member_visit:<visit_uuid>.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_points_ledger (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.ucapsa_points_seasons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_code text not null,
  source_type text not null,
  source_id text,
  dedupe_key text not null,
  points integer not null check (points <> 0),
  reason text not null,
  reversal_of_id uuid references public.ucapsa_points_ledger(id) on delete restrict,
  awarded_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ucapsa_points_ledger_rule_fk
    foreign key (season_id, rule_code)
    references public.ucapsa_points_rules(season_id, code)
    on delete restrict,
  unique (season_id, dedupe_key)
);

create index if not exists ucapsa_points_ledger_user_season_idx
  on public.ucapsa_points_ledger (season_id, user_id, occurred_at desc);

create index if not exists ucapsa_points_ledger_source_idx
  on public.ucapsa_points_ledger (source_type, source_id);

create index if not exists ucapsa_points_ledger_created_idx
  on public.ucapsa_points_ledger (created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at triggers
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

-- Keep explicit triggers so this file stays easy to review and replay.
drop trigger if exists set_ucapsa_points_seasons_updated_at on public.ucapsa_points_seasons;
create trigger set_ucapsa_points_seasons_updated_at
before update on public.ucapsa_points_seasons
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists set_ucapsa_points_rules_updated_at on public.ucapsa_points_rules;
create trigger set_ucapsa_points_rules_updated_at
before update on public.ucapsa_points_rules
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists set_ucapsa_points_profiles_updated_at on public.ucapsa_points_profiles;
create trigger set_ucapsa_points_profiles_updated_at
before update on public.ucapsa_points_profiles
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists set_ucapsa_points_tiers_updated_at on public.ucapsa_points_tiers;
create trigger set_ucapsa_points_tiers_updated_at
before update on public.ucapsa_points_tiers
for each row execute function public.set_updated_at_timestamp();

-- -----------------------------------------------------------------------------
-- RLS: clients never write scores directly.
-- Leaderboard disclosure must later happen through a dedicated RPC that returns
-- only safe display fields, not raw user UUIDs/PII.
-- -----------------------------------------------------------------------------

alter table public.ucapsa_points_seasons enable row level security;
alter table public.ucapsa_points_rules enable row level security;
alter table public.ucapsa_points_profiles enable row level security;
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

drop policy if exists "Users can read own points profile" on public.ucapsa_points_profiles;
create policy "Users can read own points profile"
on public.ucapsa_points_profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_ucapsa_admin());

drop policy if exists "Users can read own points ledger" on public.ucapsa_points_ledger;
create policy "Users can read own points ledger"
on public.ucapsa_points_ledger
for select
to authenticated
using (auth.uid() = user_id or public.is_ucapsa_admin());

drop policy if exists "Admins can read points rules" on public.ucapsa_points_rules;
create policy "Admins can read points rules"
on public.ucapsa_points_rules
for select
to authenticated
using (public.is_ucapsa_admin());

-- No insert/update/delete policies are created for ledger/rules/seasons/tiers.
-- Awards and configuration must go through reviewed server-side RPCs or
-- service_role after the MVP scoring rules are approved.

-- -----------------------------------------------------------------------------
-- Deliberately NOT included in this foundation
-- -----------------------------------------------------------------------------
-- - no season seed
-- - no point values
-- - no member_visits trigger
-- - no historical backfill
-- - no public leaderboard RPC
-- - no badge duplication (reuse achievement_definitions/user_achievements)
