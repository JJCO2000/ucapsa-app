-- UCAPSA Rango 1 — canonical structural foundation
--
-- IMPORTANT
-- 1) Versioned design only. NOT applied remotely by this commit.
-- 2) This supersedes the old single-representative-dog points proposal.
-- 3) No point values, rank thresholds or leaderboard formula are defined here.
-- 4) Do not run remotely until the current Supabase schema is recaptured/reviewed.
-- 5) Rango/Ranking/Podio are derived products; this file stores only canonical facts.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared updated_at helper for Rango 1 tables.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_rango_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Seasons
-- One active season. Periods cannot overlap, including drafts, so one fact date
-- can never belong to two competitive seasons.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_competition_seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
);

create unique index if not exists ucapsa_competition_one_active_season_idx
  on public.ucapsa_competition_seasons ((status))
  where status = 'active';

create index if not exists ucapsa_competition_seasons_dates_idx
  on public.ucapsa_competition_seasons (starts_at desc, ends_at desc);

drop trigger if exists trg_ucapsa_competition_seasons_updated_at
  on public.ucapsa_competition_seasons;
create trigger trg_ucapsa_competition_seasons_updated_at
before update on public.ucapsa_competition_seasons
for each row execute function public.ucapsa_rango_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Member visit -> dogs snapshot
-- member_visits remains the single visit event. This join records which dogs
-- received credit at that moment. It does not copy points, rank or season.
-- -----------------------------------------------------------------------------

create table if not exists public.member_visit_dogs (
  visit_id uuid not null references public.member_visits(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete restrict,
  credit_source text not null default 'auto'
    check (credit_source in ('auto', 'admin')),
  credited_at timestamptz not null default now(),
  credited_by uuid references auth.users(id) on delete set null,
  primary key (visit_id, dog_id)
);

create index if not exists member_visit_dogs_dog_idx
  on public.member_visit_dogs (dog_id, credited_at desc);

create or replace function public.ucapsa_validate_member_visit_dog_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit_user uuid;
  v_dog_user uuid;
begin
  select user_id into v_visit_user
  from public.member_visits
  where id = new.visit_id;

  select user_id into v_dog_user
  from public.dogs
  where id = new.dog_id;

  if v_visit_user is null or v_dog_user is null or v_visit_user <> v_dog_user then
    raise exception 'member_visit_dog_owner_mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ucapsa_validate_member_visit_dog_owner
  on public.member_visit_dogs;
create trigger trg_ucapsa_validate_member_visit_dog_owner
before insert or update on public.member_visit_dogs
for each row execute function public.ucapsa_validate_member_visit_dog_owner();

-- -----------------------------------------------------------------------------
-- 3. Exams and items
-- program_exams remains the existing course/promotion workflow. These tables are
-- the granular competitive evaluation product and do not replace promotion.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_exams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.ucapsa_competition_seasons(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  exam_date date,
  is_required_for_ranking boolean not null default true,
  sort_order integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, code)
);

create index if not exists ucapsa_exams_season_idx
  on public.ucapsa_exams (season_id, status, sort_order, exam_date);

drop trigger if exists trg_ucapsa_exams_updated_at on public.ucapsa_exams;
create trigger trg_ucapsa_exams_updated_at
before update on public.ucapsa_exams
for each row execute function public.ucapsa_rango_touch_updated_at();

create table if not exists public.ucapsa_exam_items (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.ucapsa_exams(id) on delete cascade,
  item_number integer not null check (item_number > 0),
  title text not null,
  description text,
  max_points numeric(10,2) not null check (max_points > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, item_number)
);

create index if not exists ucapsa_exam_items_exam_idx
  on public.ucapsa_exam_items (exam_id, sort_order, item_number);

drop trigger if exists trg_ucapsa_exam_items_updated_at on public.ucapsa_exam_items;
create trigger trg_ucapsa_exam_items_updated_at
before update on public.ucapsa_exam_items
for each row execute function public.ucapsa_rango_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Import batches
-- Preview/validation may exist before canonical writes. Once confirmed, all rows
-- created by the import point back to one batch for audit/reversal workflows.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_import_batches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.ucapsa_competition_seasons(id) on delete restrict,
  exam_id uuid references public.ucapsa_exams(id) on delete restrict,
  import_type text not null
    check (import_type in ('exam_results', 'admin_adjustments', 'attendance_history')),
  status text not null default 'draft'
    check (status in ('draft', 'validated', 'committed', 'reverted')),
  file_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  committed_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (import_type = 'exam_results' and exam_id is not null)
    or (import_type <> 'exam_results' and exam_id is null)
  )
);

create index if not exists ucapsa_import_batches_season_idx
  on public.ucapsa_import_batches (season_id, import_type, created_at desc);

drop trigger if exists trg_ucapsa_import_batches_updated_at on public.ucapsa_import_batches;
create trigger trg_ucapsa_import_batches_updated_at
before update on public.ucapsa_import_batches
for each row execute function public.ucapsa_rango_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Exam attempts and item results
-- No user_id, season_id or total score is duplicated here. Ownership comes from
-- dogs; season comes from exam; total comes from item results.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.ucapsa_exams(id) on delete restrict,
  dog_id uuid not null references public.dogs(id) on delete restrict,
  attempt_number integer not null default 1 check (attempt_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'voided')),
  is_official boolean not null default false,
  presented_at timestamptz not null,
  import_batch_id uuid references public.ucapsa_import_batches(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, dog_id, attempt_number),
  check (not is_official or status = 'published')
);

create unique index if not exists ucapsa_exam_attempts_one_official_idx
  on public.ucapsa_exam_attempts (exam_id, dog_id)
  where is_official = true;

create index if not exists ucapsa_exam_attempts_dog_idx
  on public.ucapsa_exam_attempts (dog_id, exam_id, presented_at desc);

drop trigger if exists trg_ucapsa_exam_attempts_updated_at on public.ucapsa_exam_attempts;
create trigger trg_ucapsa_exam_attempts_updated_at
before update on public.ucapsa_exam_attempts
for each row execute function public.ucapsa_rango_touch_updated_at();

create table if not exists public.ucapsa_exam_item_results (
  attempt_id uuid not null
    references public.ucapsa_exam_attempts(id) on delete cascade,
  exam_item_id uuid not null
    references public.ucapsa_exam_items(id) on delete restrict,
  points_awarded numeric(10,2) not null check (points_awarded >= 0),
  evaluator_note text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, exam_item_id)
);

create index if not exists ucapsa_exam_item_results_item_idx
  on public.ucapsa_exam_item_results (exam_item_id);

drop trigger if exists trg_ucapsa_exam_item_results_updated_at
  on public.ucapsa_exam_item_results;
create trigger trg_ucapsa_exam_item_results_updated_at
before update on public.ucapsa_exam_item_results
for each row execute function public.ucapsa_rango_touch_updated_at();

create or replace function public.ucapsa_validate_exam_item_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_exam uuid;
  v_item_exam uuid;
  v_max_points numeric(10,2);
begin
  select exam_id into v_attempt_exam
  from public.ucapsa_exam_attempts
  where id = new.attempt_id;

  select exam_id, max_points into v_item_exam, v_max_points
  from public.ucapsa_exam_items
  where id = new.exam_item_id;

  if v_attempt_exam is null or v_item_exam is null or v_attempt_exam <> v_item_exam then
    raise exception 'exam_item_attempt_mismatch' using errcode = '23514';
  end if;

  if new.points_awarded > v_max_points then
    raise exception 'exam_item_points_exceed_maximum' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ucapsa_validate_exam_item_result
  on public.ucapsa_exam_item_results;
create trigger trg_ucapsa_validate_exam_item_result
before insert or update on public.ucapsa_exam_item_results
for each row execute function public.ucapsa_validate_exam_item_result();

-- -----------------------------------------------------------------------------
-- 6. Admin point adjustments
-- Signed, append-only movements. No mandatory reason. The UI may offer a note,
-- but audit identity/timestamp are structural. Reversals are another movement.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_competition_adjustments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.ucapsa_competition_seasons(id) on delete restrict,
  dog_id uuid not null references public.dogs(id) on delete restrict,
  points numeric(12,2) not null check (points <> 0),
  note text,
  import_batch_id uuid references public.ucapsa_import_batches(id) on delete set null,
  reversal_of_id uuid references public.ucapsa_competition_adjustments(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists ucapsa_competition_adjustments_dog_idx
  on public.ucapsa_competition_adjustments (season_id, dog_id, occurred_at desc);

create index if not exists ucapsa_competition_adjustments_import_idx
  on public.ucapsa_competition_adjustments (import_batch_id)
  where import_batch_id is not null;

-- -----------------------------------------------------------------------------
-- 7. Permanent awards
-- Training milestones remain in the existing dog-scoped achievement system.
-- These tables are only for institutional awards such as Perro del Año.
-- -----------------------------------------------------------------------------

create table if not exists public.ucapsa_award_definitions (
  code text primary key,
  title text not null,
  description text,
  icon_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_ucapsa_award_definitions_updated_at
  on public.ucapsa_award_definitions;
create trigger trg_ucapsa_award_definitions_updated_at
before update on public.ucapsa_award_definitions
for each row execute function public.ucapsa_rango_touch_updated_at();

insert into public.ucapsa_award_definitions (code, title, description, icon_key)
values (
  'dog_of_year',
  'Perro del Año',
  'Reconocimiento institucional permanente otorgado explícitamente por UCAPSA.',
  'trophy'
)
on conflict (code) do nothing;

create table if not exists public.dog_awards (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete restrict,
  award_code text not null
    references public.ucapsa_award_definitions(code) on delete restrict,
  season_id uuid references public.ucapsa_competition_seasons(id) on delete restrict,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references auth.users(id) on delete set null,
  note text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists dog_awards_one_active_award_idx
  on public.dog_awards (
    dog_id,
    award_code,
    coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where revoked_at is null;

create index if not exists dog_awards_dog_idx
  on public.dog_awards (dog_id, awarded_at desc);

-- -----------------------------------------------------------------------------
-- 8. RLS: clients read only their own dog-specific facts plus published exam
-- definitions. Writes stay server/admin controlled; no direct client write policy.
-- -----------------------------------------------------------------------------

alter table public.ucapsa_competition_seasons enable row level security;
alter table public.member_visit_dogs enable row level security;
alter table public.ucapsa_exams enable row level security;
alter table public.ucapsa_exam_items enable row level security;
alter table public.ucapsa_import_batches enable row level security;
alter table public.ucapsa_exam_attempts enable row level security;
alter table public.ucapsa_exam_item_results enable row level security;
alter table public.ucapsa_competition_adjustments enable row level security;
alter table public.ucapsa_award_definitions enable row level security;
alter table public.dog_awards enable row level security;

drop policy if exists "Authenticated read competition seasons"
  on public.ucapsa_competition_seasons;
create policy "Authenticated read competition seasons"
on public.ucapsa_competition_seasons
for select to authenticated
using (true);

drop policy if exists "Users read own member visit dogs"
  on public.member_visit_dogs;
create policy "Users read own member visit dogs"
on public.member_visit_dogs
for select to authenticated
using (
  public.is_ucapsa_admin()
  or exists (
    select 1 from public.dogs d
    where d.id = member_visit_dogs.dog_id
      and d.user_id = auth.uid()
  )
);

drop policy if exists "Authenticated read published exams"
  on public.ucapsa_exams;
create policy "Authenticated read published exams"
on public.ucapsa_exams
for select to authenticated
using (status = 'published' or public.is_ucapsa_admin());

drop policy if exists "Authenticated read published exam items"
  on public.ucapsa_exam_items;
create policy "Authenticated read published exam items"
on public.ucapsa_exam_items
for select to authenticated
using (
  public.is_ucapsa_admin()
  or exists (
    select 1 from public.ucapsa_exams e
    where e.id = ucapsa_exam_items.exam_id
      and e.status = 'published'
  )
);

drop policy if exists "Admins read import batches"
  on public.ucapsa_import_batches;
create policy "Admins read import batches"
on public.ucapsa_import_batches
for select to authenticated
using (public.is_ucapsa_admin());

drop policy if exists "Users read own official exam attempts"
  on public.ucapsa_exam_attempts;
create policy "Users read own official exam attempts"
on public.ucapsa_exam_attempts
for select to authenticated
using (
  public.is_ucapsa_admin()
  or (
    status = 'published'
    and is_official = true
    and exists (
      select 1 from public.dogs d
      where d.id = ucapsa_exam_attempts.dog_id
        and d.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users read own official exam item results"
  on public.ucapsa_exam_item_results;
create policy "Users read own official exam item results"
on public.ucapsa_exam_item_results
for select to authenticated
using (
  public.is_ucapsa_admin()
  or exists (
    select 1
    from public.ucapsa_exam_attempts a
    join public.dogs d on d.id = a.dog_id
    where a.id = ucapsa_exam_item_results.attempt_id
      and a.status = 'published'
      and a.is_official = true
      and d.user_id = auth.uid()
  )
);

drop policy if exists "Users read own competition adjustments"
  on public.ucapsa_competition_adjustments;
create policy "Users read own competition adjustments"
on public.ucapsa_competition_adjustments
for select to authenticated
using (
  public.is_ucapsa_admin()
  or exists (
    select 1 from public.dogs d
    where d.id = ucapsa_competition_adjustments.dog_id
      and d.user_id = auth.uid()
  )
);

drop policy if exists "Authenticated read award definitions"
  on public.ucapsa_award_definitions;
create policy "Authenticated read award definitions"
on public.ucapsa_award_definitions
for select to authenticated
using (is_active = true or public.is_ucapsa_admin());

drop policy if exists "Users read own dog awards"
  on public.dog_awards;
create policy "Users read own dog awards"
on public.dog_awards
for select to authenticated
using (
  public.is_ucapsa_admin()
  or exists (
    select 1 from public.dogs d
    where d.id = dog_awards.dog_id
      and d.user_id = auth.uid()
  )
);

-- No insert/update/delete policies are intentionally granted here.
-- Mutations will be exposed later through reviewed RPCs/service-role operations.

-- -----------------------------------------------------------------------------
-- 9. Deliberately derived / NOT stored as canonical columns or tables
-- -----------------------------------------------------------------------------
-- - attendance totals
-- - member visit totals
-- - exam totals
-- - eligibility boolean
-- - rank/tier
-- - next rank progress
-- - competition total/score
-- - rank_position
-- - podium medal
--
-- Future RPCs/views must derive these from:
-- program_attendances + program_enrollments.dog_id
-- member_visits + member_visit_dogs
-- ucapsa_exams + ucapsa_exam_attempts + ucapsa_exam_item_results
-- ucapsa_competition_adjustments
--
-- No automatic scoring triggers, leaderboard RPC, rank thresholds or remote
-- application are included in this foundation.
