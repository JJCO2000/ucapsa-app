-- UCAPSA PUBLIC SCHEMA SOURCE OF TRUTH
-- Project: hrfecmviyiluubymsoeq
-- Captured: 2026-09-06 after RLS remediation 1.2
-- Schema-only catalog snapshot; contains no application row data.
-- This file documents the live public schema and security configuration.

create type public.app_role as enum ('client', 'member', 'admin', 'super_admin');
create type public.audience_type as enum ('public', 'clients', 'members', 'admins');
create type public.membership_status as enum ('none', 'pending', 'active', 'expired', 'rejected', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'cancelled');

create table public.achievement_definitions (
  code text not null,
  title text not null,
  description text,
  unlocked_title text not null,
  unlocked_description text,
  icon text default 'medal'::text not null,
  color_key text default 'gray'::text not null,
  sort_order integer default 100 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.admin_audit_logs (
  id uuid default gen_random_uuid() not null,
  admin_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamp with time zone default now() not null
);

create table public.announcements (
  id uuid default gen_random_uuid() not null,
  title text not null,
  content text not null,
  audience audience_type default 'public'::audience_type not null,
  is_pinned boolean default false not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_published boolean default true not null,
  archived_at timestamp with time zone,
  event_id uuid,
  announcement_date timestamp with time zone,
  color_key text default 'red'::text,
  priority text default 'normal'::text
);

create table public.attendance_qr_codes (
  program_code text not null,
  token uuid default gen_random_uuid() not null,
  is_active boolean default true not null,
  version integer default 1 not null,
  window_before_minutes integer default 30 not null,
  window_after_minutes integer default 120 not null,
  rotated_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.dog_documents (
  id uuid default gen_random_uuid() not null,
  dog_id uuid not null,
  document_type text not null,
  storage_path text not null,
  original_filename text,
  issued_on date,
  expires_on date,
  status text default 'pending'::text not null,
  uploaded_by uuid default auth.uid(),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.dogs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  photo_path text,
  breed text,
  birth_date date,
  sex text,
  weight_kg numeric(6,2),
  allergies text,
  medications text,
  feeding_notes text,
  behavior_notes text,
  veterinarian_name text,
  veterinarian_phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.events (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  location text,
  start_date timestamp with time zone not null,
  end_date timestamp with time zone,
  audience audience_type default 'public'::audience_type not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_published boolean default true not null,
  archived_at timestamp with time zone,
  has_time boolean default true not null,
  recurrence_key text,
  recurrence_label text,
  repeat_type text default 'none'::text not null,
  repeat_interval_days integer,
  repeat_limit integer default 10 not null,
  color_key text default 'green'::text,
  priority text default 'normal'::text
);

create table public.feature_flags (
  code text not null,
  enabled boolean default false not null,
  description text,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.member_visits (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  membership_id uuid,
  visited_at timestamp with time zone default now() not null,
  visit_date date default ((clock_timestamp() AT TIME ZONE 'America/Mexico_City'::text))::date not null,
  source text default 'qr_member'::text not null,
  recorded_by uuid,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.membership_billing_profiles (
  membership_id uuid not null,
  amount numeric(12,2) not null,
  due_day smallint not null,
  starts_on date not null,
  ends_on date,
  is_active boolean default true not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.membership_delete_requests (
  id uuid default gen_random_uuid() not null,
  membership_id uuid not null,
  user_id uuid not null,
  requested_by uuid,
  resolved_by uuid,
  status text default 'pending'::text not null,
  reason text,
  snapshot_member_number text,
  snapshot_name text,
  snapshot_email text,
  requested_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.memberships (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  member_number text,
  status membership_status default 'pending'::membership_status not null,
  start_date date,
  end_date date,
  qr_token text default (gen_random_uuid())::text not null,
  approved_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  current_payment_status text default 'pending'::text not null,
  last_payment_at timestamp with time zone,
  payment_notes text
);

create table public.notification_campaigns (
  id uuid default gen_random_uuid() not null,
  title text not null,
  body text not null,
  audience text default 'public'::text not null,
  category text default 'announcements_events'::text not null,
  status text default 'draft'::text not null,
  total_targets integer default 0 not null,
  success_count integer default 0 not null,
  failure_count integer default 0 not null,
  created_by uuid,
  sent_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  archived_at timestamp with time zone
);

create table public.notification_class_cancellation_locks (
  id uuid default gen_random_uuid() not null,
  enrollment_id uuid not null,
  user_id uuid not null,
  program_id uuid not null,
  schedule_id uuid not null,
  cancellation_date date not null,
  campaign_id uuid,
  status text default 'locked'::text not null,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.notification_class_reminder_locks (
  id uuid default gen_random_uuid() not null,
  enrollment_id uuid not null,
  user_id uuid not null,
  program_id uuid not null,
  schedule_id uuid not null,
  class_date date not null,
  reminder_type text default 'class_24h'::text not null,
  campaign_id uuid,
  status text default 'locked'::text not null,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.notification_deliveries (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  user_id uuid not null,
  token_id uuid,
  expo_push_token text not null,
  status text default 'queued'::text not null,
  expo_response jsonb default '{}'::jsonb not null,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.notification_preferences (
  user_id uuid not null,
  enabled boolean default false not null,
  announcements_events boolean default true not null,
  classes boolean default true not null,
  membership boolean default true not null,
  achievements boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.notification_tokens (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  expo_push_token text not null,
  platform text default 'unknown'::text not null,
  device_name text,
  device_id text,
  app_ownership text,
  app_version text,
  project_id text,
  is_active boolean default true not null,
  last_registered_at timestamp with time zone default now() not null,
  disabled_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.payment_obligations (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  membership_id uuid,
  obligation_type text default 'membership'::text not null,
  concept text not null,
  period_start date,
  period_end date,
  due_date date not null,
  amount numeric(12,2) not null,
  currency text default 'MXN'::text not null,
  source text default 'manual'::text not null,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.payment_settings (
  id smallint default 1 not null,
  bank_name text,
  account_holder text,
  clabe text,
  transfer_instructions text,
  clip_url text,
  is_active boolean default true not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.payments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  amount numeric(10,2) default 0 not null,
  concept text not null,
  status payment_status default 'pending'::payment_status not null,
  payment_method text,
  paid_at timestamp with time zone,
  registered_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  membership_id uuid,
  notes text,
  period_label text,
  obligation_id uuid
);

create table public.practice_sessions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  dog_id uuid,
  enrollment_id uuid,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone default now() not null,
  difficulty text not null,
  note text,
  duration_seconds integer,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  client_event_id uuid
);

create table public.profiles (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  full_name text,
  email text,
  phone text,
  role app_role default 'client'::app_role not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  dog_name text,
  avatar_color text default '#0f766e'::text not null,
  deletion_requested_at timestamp with time zone,
  deletion_request_reason text
);

create table public.program_attendances (
  id uuid default gen_random_uuid() not null,
  enrollment_id uuid not null,
  attendance_date date default CURRENT_DATE not null,
  marked_by uuid,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  session_id uuid,
  source text default 'legacy'::text not null,
  recorded_at timestamp with time zone default now() not null,
  outside_window boolean default false not null
);

create table public.program_class_cancellations (
  id uuid default gen_random_uuid() not null,
  schedule_id uuid not null,
  cancellation_date date not null,
  reason text,
  announcement_id uuid,
  created_by uuid,
  restored_at timestamp with time zone,
  restored_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.program_enrollments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  program_id uuid not null,
  schedule_id uuid not null,
  dog_name text,
  physical_card_number text,
  qr_token text not null,
  status text default 'active'::text not null,
  attendances_count integer default 0 not null,
  notes text,
  started_at date default CURRENT_DATE,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  program_level text default 'base'::text not null,
  last_attendance_at date,
  dog_id uuid,
  card_started_on date,
  card_expires_on date,
  requirements_met_at timestamp with time zone
);

create table public.program_exams (
  id uuid default gen_random_uuid() not null,
  enrollment_id uuid not null,
  status text default 'requested'::text not null,
  requested_by uuid default auth.uid(),
  requested_at timestamp with time zone default now() not null,
  scheduled_at timestamp with time zone,
  completed_at timestamp with time zone,
  result_notes text,
  reviewed_by uuid,
  target_level text,
  promotion_applied_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.program_schedule_versions (
  id uuid default gen_random_uuid() not null,
  schedule_id uuid not null,
  effective_from date not null,
  effective_to date,
  name text not null,
  day_of_week integer not null,
  start_time time without time zone not null,
  repeat_type text not null,
  cycle_start_date date,
  sequence_order integer default 1 not null,
  is_active boolean default true not null,
  change_note text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  retired_at timestamp with time zone,
  retired_by uuid
);

create table public.program_schedules (
  id uuid default gen_random_uuid() not null,
  program_id uuid not null,
  name text not null,
  day_of_week integer not null,
  start_time time without time zone not null,
  repeat_type text default 'weekly'::text not null,
  cycle_start_date date,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  sequence_order integer default 1 not null
);

create table public.program_sessions (
  id uuid default gen_random_uuid() not null,
  schedule_id uuid not null,
  session_date date not null,
  scheduled_start_time time without time zone not null,
  status text default 'scheduled'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.programs (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  description text,
  required_attendances integer default 1 not null,
  color_key text default 'gray'::text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.user_achievements (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  achievement_code text not null,
  source_type text,
  source_id uuid,
  awarded_at timestamp with time zone default now() not null,
  awarded_by uuid,
  created_at timestamp with time zone default now() not null
);

