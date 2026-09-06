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

alter table public.achievement_definitions add constraint achievement_definitions_color_key_check CHECK (color_key = ANY (ARRAY['red'::text, 'blue'::text, 'yellow'::text, 'green'::text, 'purple'::text, 'gray'::text]));
alter table public.achievement_definitions add constraint achievement_definitions_pkey PRIMARY KEY (code);
alter table public.admin_audit_logs add constraint admin_audit_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id);
alter table public.admin_audit_logs add constraint admin_audit_logs_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.announcements add constraint announcements_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.attendance_qr_codes add constraint attendance_qr_codes_after_window_check CHECK (window_after_minutes >= 0 AND window_after_minutes <= 360);
alter table public.attendance_qr_codes add constraint attendance_qr_codes_before_window_check CHECK (window_before_minutes >= 0 AND window_before_minutes <= 180);
alter table public.attendance_qr_codes add constraint attendance_qr_codes_pkey PRIMARY KEY (program_code);
alter table public.attendance_qr_codes add constraint attendance_qr_codes_program_check CHECK (program_code = ANY (ARRAY['puppy'::text, 'comandos'::text, 'member'::text]));
alter table public.attendance_qr_codes add constraint attendance_qr_codes_token_key UNIQUE (token);
alter table public.attendance_qr_codes add constraint attendance_qr_codes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.attendance_qr_codes add constraint attendance_qr_codes_version_check CHECK (version >= 1);
alter table public.dog_documents add constraint dog_documents_dates_check CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on);
alter table public.dog_documents add constraint dog_documents_dog_id_fkey FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE;
alter table public.dog_documents add constraint dog_documents_path_not_blank CHECK (btrim(storage_path) <> ''::text);
alter table public.dog_documents add constraint dog_documents_pkey PRIMARY KEY (id);
alter table public.dog_documents add constraint dog_documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.dog_documents add constraint dog_documents_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
alter table public.dog_documents add constraint dog_documents_type_not_blank CHECK (btrim(document_type) <> ''::text);
alter table public.dog_documents add constraint dog_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.dogs add constraint dogs_name_not_blank CHECK (btrim(name) <> ''::text);
alter table public.dogs add constraint dogs_pkey PRIMARY KEY (id);
alter table public.dogs add constraint dogs_sex_check CHECK (sex IS NULL OR (sex = ANY (ARRAY['female'::text, 'male'::text, 'unknown'::text])));
alter table public.dogs add constraint dogs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.dogs add constraint dogs_weight_non_negative CHECK (weight_kg IS NULL OR weight_kg >= 0::numeric);
alter table public.events add constraint events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.events add constraint events_end_after_start CHECK (end_date IS NULL OR end_date >= start_date);
alter table public.events add constraint events_pkey PRIMARY KEY (id);
alter table public.events add constraint events_repeat_interval_days_check CHECK (repeat_interval_days IS NULL OR repeat_interval_days >= 1 AND repeat_interval_days <= 365);
alter table public.events add constraint events_repeat_limit_check CHECK (repeat_limit >= 1 AND repeat_limit <= 10);
alter table public.events add constraint events_repeat_type_check CHECK (repeat_type = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text, 'custom_days'::text]));
alter table public.feature_flags add constraint feature_flags_code_check CHECK (code = ANY (ARRAY['exams'::text, 'dog_profiles'::text, 'dog_documents'::text]));
alter table public.feature_flags add constraint feature_flags_pkey PRIMARY KEY (code);
alter table public.feature_flags add constraint feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.member_visits add constraint member_visits_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL;
alter table public.member_visits add constraint member_visits_pkey PRIMARY KEY (id);
alter table public.member_visits add constraint member_visits_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.member_visits add constraint member_visits_source_check CHECK (source = ANY (ARRAY['qr_member'::text, 'admin_manual'::text]));
alter table public.member_visits add constraint member_visits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.membership_billing_profiles add constraint membership_billing_amount_check CHECK (amount >= 0::numeric);
alter table public.membership_billing_profiles add constraint membership_billing_dates_check CHECK (ends_on IS NULL OR ends_on >= starts_on);
alter table public.membership_billing_profiles add constraint membership_billing_due_day_check CHECK (due_day >= 1 AND due_day <= 31);
alter table public.membership_billing_profiles add constraint membership_billing_profiles_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE;
alter table public.membership_billing_profiles add constraint membership_billing_profiles_pkey PRIMARY KEY (membership_id);
alter table public.membership_billing_profiles add constraint membership_billing_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.membership_delete_requests add constraint membership_delete_requests_pkey PRIMARY KEY (id);
alter table public.membership_delete_requests add constraint membership_delete_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.membership_delete_requests add constraint membership_delete_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.membership_delete_requests add constraint membership_delete_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
alter table public.memberships add constraint memberships_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
alter table public.memberships add constraint memberships_current_payment_status_check CHECK (current_payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'not_required'::text]));
alter table public.memberships add constraint memberships_end_after_start CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
alter table public.memberships add constraint memberships_member_number_key UNIQUE (member_number);
alter table public.memberships add constraint memberships_pkey PRIMARY KEY (id);
alter table public.memberships add constraint memberships_qr_token_key UNIQUE (qr_token);
alter table public.memberships add constraint memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.memberships add constraint memberships_user_id_key UNIQUE (user_id);
alter table public.notification_campaigns add constraint notification_campaigns_audience_check CHECK (audience = ANY (ARRAY['public'::text, 'clients'::text, 'members'::text, 'admins'::text]));
alter table public.notification_campaigns add constraint notification_campaigns_category_check CHECK (category = ANY (ARRAY['announcements_events'::text, 'classes'::text, 'membership'::text, 'achievements'::text]));
alter table public.notification_campaigns add constraint notification_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.notification_campaigns add constraint notification_campaigns_pkey PRIMARY KEY (id);
alter table public.notification_campaigns add constraint notification_campaigns_status_check CHECK (status = ANY (ARRAY['draft'::text, 'sending'::text, 'sent'::text, 'partial_failed'::text, 'failed'::text, 'no_targets'::text]));
alter table public.notification_class_cancellation_locks add constraint notification_class_cancellation_locks_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE SET NULL;
alter table public.notification_class_cancellation_locks add constraint notification_class_cancellation_locks_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES program_enrollments(id) ON DELETE CASCADE;
alter table public.notification_class_cancellation_locks add constraint notification_class_cancellation_locks_pkey PRIMARY KEY (id);
alter table public.notification_class_cancellation_locks add constraint notification_class_cancellation_locks_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
alter table public.notification_class_cancellation_locks add constraint notification_class_cancellation_locks_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES program_schedules(id) ON DELETE CASCADE;
alter table public.notification_class_cancellation_locks add constraint notification_class_cancellation_locks_status_check CHECK (status = ANY (ARRAY['locked'::text, 'sent'::text, 'skipped'::text, 'failed'::text]));
alter table public.notification_class_cancellation_locks add constraint notification_class_cancellation_locks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notification_class_reminder_locks add constraint notification_class_reminder_locks_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE SET NULL;
alter table public.notification_class_reminder_locks add constraint notification_class_reminder_locks_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES program_enrollments(id) ON DELETE CASCADE;
alter table public.notification_class_reminder_locks add constraint notification_class_reminder_locks_pkey PRIMARY KEY (id);
alter table public.notification_class_reminder_locks add constraint notification_class_reminder_locks_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
alter table public.notification_class_reminder_locks add constraint notification_class_reminder_locks_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES program_schedules(id) ON DELETE CASCADE;
alter table public.notification_class_reminder_locks add constraint notification_class_reminder_locks_status_check CHECK (status = ANY (ARRAY['locked'::text, 'sent'::text, 'skipped'::text, 'failed'::text]));
alter table public.notification_class_reminder_locks add constraint notification_class_reminder_locks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notification_deliveries add constraint notification_deliveries_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE CASCADE;
alter table public.notification_deliveries add constraint notification_deliveries_pkey PRIMARY KEY (id);
alter table public.notification_deliveries add constraint notification_deliveries_status_check CHECK (status = ANY (ARRAY['queued'::text, 'sent'::text, 'error'::text]));
alter table public.notification_deliveries add constraint notification_deliveries_token_id_fkey FOREIGN KEY (token_id) REFERENCES notification_tokens(id) ON DELETE SET NULL;
alter table public.notification_deliveries add constraint notification_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notification_preferences add constraint notification_preferences_pkey PRIMARY KEY (user_id);
alter table public.notification_preferences add constraint notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notification_tokens add constraint notification_tokens_expo_push_token_key UNIQUE (expo_push_token);
alter table public.notification_tokens add constraint notification_tokens_pkey PRIMARY KEY (id);
alter table public.notification_tokens add constraint notification_tokens_platform_check CHECK (platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text, 'unknown'::text]));
alter table public.notification_tokens add constraint notification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.payment_obligations add constraint payment_obligations_amount_check CHECK (amount >= 0::numeric);
alter table public.payment_obligations add constraint payment_obligations_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payment_obligations add constraint payment_obligations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payment_obligations add constraint payment_obligations_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
alter table public.payment_obligations add constraint payment_obligations_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL;
alter table public.payment_obligations add constraint payment_obligations_period_check CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start);
alter table public.payment_obligations add constraint payment_obligations_pkey PRIMARY KEY (id);
alter table public.payment_obligations add constraint payment_obligations_source_check CHECK (source = ANY (ARRAY['manual'::text, 'recurring'::text, 'service'::text, 'purchase'::text]));
alter table public.payment_obligations add constraint payment_obligations_type_check CHECK (obligation_type = ANY (ARRAY['membership'::text, 'program'::text, 'service'::text, 'purchase'::text, 'other'::text]));
alter table public.payment_obligations add constraint payment_obligations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.payment_settings add constraint payment_settings_clabe_check CHECK (clabe IS NULL OR clabe ~ '^[0-9]{18}$'::text);
alter table public.payment_settings add constraint payment_settings_pkey PRIMARY KEY (id);
alter table public.payment_settings add constraint payment_settings_singleton CHECK (id = 1);
alter table public.payment_settings add constraint payment_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_amount_non_negative CHECK (amount >= 0::numeric);
alter table public.payments add constraint payments_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES payment_obligations(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES auth.users(id);
alter table public.payments add constraint payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.practice_sessions add constraint practice_sessions_difficulty_check CHECK (difficulty = ANY (ARRAY['easy'::text, 'good'::text, 'hard'::text]));
alter table public.practice_sessions add constraint practice_sessions_dog_id_fkey FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE SET NULL;
alter table public.practice_sessions add constraint practice_sessions_duration_check CHECK (duration_seconds IS NULL OR duration_seconds >= 0);
alter table public.practice_sessions add constraint practice_sessions_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES program_enrollments(id) ON DELETE SET NULL;
alter table public.practice_sessions add constraint practice_sessions_pkey PRIMARY KEY (id);
alter table public.practice_sessions add constraint practice_sessions_time_check CHECK (completed_at >= started_at);
alter table public.practice_sessions add constraint practice_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_avatar_color_format_check CHECK (avatar_color ~ '^#[0-9A-Fa-f]{6}$'::text);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_user_id_key UNIQUE (user_id);
alter table public.program_attendances add constraint program_attendances_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES program_enrollments(id) ON DELETE CASCADE;
alter table public.program_attendances add constraint program_attendances_pkey PRIMARY KEY (id);
alter table public.program_attendances add constraint program_attendances_session_id_fkey FOREIGN KEY (session_id) REFERENCES program_sessions(id) ON DELETE RESTRICT;
alter table public.program_class_cancellations add constraint program_class_cancellations_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE SET NULL;
alter table public.program_class_cancellations add constraint program_class_cancellations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.program_class_cancellations add constraint program_class_cancellations_pkey PRIMARY KEY (id);
alter table public.program_class_cancellations add constraint program_class_cancellations_restored_by_fkey FOREIGN KEY (restored_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.program_class_cancellations add constraint program_class_cancellations_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES program_schedules(id) ON DELETE CASCADE;
alter table public.program_enrollments add constraint program_enrollments_attendances_count_check CHECK (attendances_count >= 0);
alter table public.program_enrollments add constraint program_enrollments_card_dates_check CHECK (card_started_on IS NULL OR card_expires_on IS NULL OR card_expires_on >= card_started_on);
alter table public.program_enrollments add constraint program_enrollments_dog_id_fkey FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE SET NULL;
alter table public.program_enrollments add constraint program_enrollments_pkey PRIMARY KEY (id);
alter table public.program_enrollments add constraint program_enrollments_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT;
alter table public.program_enrollments add constraint program_enrollments_program_level_check CHECK (program_level = ANY (ARRAY['base'::text, 'principiante'::text, 'medio'::text, 'avanzado'::text]));
alter table public.program_enrollments add constraint program_enrollments_qr_token_key UNIQUE (qr_token);
alter table public.program_enrollments add constraint program_enrollments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES program_schedules(id) ON DELETE RESTRICT;
alter table public.program_enrollments add constraint program_enrollments_status_check CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text]));
alter table public.program_exams add constraint program_exams_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES program_enrollments(id) ON DELETE CASCADE;
alter table public.program_exams add constraint program_exams_pkey PRIMARY KEY (id);
alter table public.program_exams add constraint program_exams_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.program_exams add constraint program_exams_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.program_exams add constraint program_exams_status_check CHECK (status = ANY (ARRAY['requested'::text, 'scheduled'::text, 'completed'::text, 'approved'::text, 'failed'::text, 'cancelled'::text]));
alter table public.program_exams add constraint program_exams_target_level_check CHECK (target_level IS NULL OR (target_level = ANY (ARRAY['base'::text, 'principiante'::text, 'medio'::text, 'avanzado'::text])));
alter table public.program_schedule_versions add constraint program_schedule_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.program_schedule_versions add constraint program_schedule_versions_day_check CHECK (day_of_week >= 0 AND day_of_week <= 6);
alter table public.program_schedule_versions add constraint program_schedule_versions_pkey PRIMARY KEY (id);
alter table public.program_schedule_versions add constraint program_schedule_versions_range_check CHECK (effective_to IS NULL OR effective_to >= effective_from);
alter table public.program_schedule_versions add constraint program_schedule_versions_repeat_check CHECK (repeat_type = ANY (ARRAY['weekly'::text, 'biweekly'::text]));
alter table public.program_schedule_versions add constraint program_schedule_versions_retired_by_fkey FOREIGN KEY (retired_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.program_schedule_versions add constraint program_schedule_versions_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES program_schedules(id) ON DELETE CASCADE;
alter table public.program_schedules add constraint program_schedules_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6);
alter table public.program_schedules add constraint program_schedules_pkey PRIMARY KEY (id);
alter table public.program_schedules add constraint program_schedules_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
alter table public.program_schedules add constraint program_schedules_repeat_type_check CHECK (repeat_type = ANY (ARRAY['weekly'::text, 'biweekly'::text]));
alter table public.program_sessions add constraint program_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.program_sessions add constraint program_sessions_pkey PRIMARY KEY (id);
alter table public.program_sessions add constraint program_sessions_schedule_date_unique UNIQUE (schedule_id, session_date);
alter table public.program_sessions add constraint program_sessions_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES program_schedules(id) ON DELETE RESTRICT;
alter table public.program_sessions add constraint program_sessions_status_check CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text]));
alter table public.programs add constraint programs_code_check CHECK (code = ANY (ARRAY['puppy'::text, 'comandos'::text]));
alter table public.programs add constraint programs_code_key UNIQUE (code);
alter table public.programs add constraint programs_color_key_check CHECK (color_key = ANY (ARRAY['red'::text, 'blue'::text, 'yellow'::text, 'green'::text, 'purple'::text, 'gray'::text]));
alter table public.programs add constraint programs_pkey PRIMARY KEY (id);
alter table public.programs add constraint programs_required_attendances_check CHECK (required_attendances > 0);
alter table public.user_achievements add constraint user_achievements_achievement_code_fkey FOREIGN KEY (achievement_code) REFERENCES achievement_definitions(code) ON DELETE RESTRICT;
alter table public.user_achievements add constraint user_achievements_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.user_achievements add constraint user_achievements_pkey PRIMARY KEY (id);
alter table public.user_achievements add constraint user_achievements_user_id_achievement_code_key UNIQUE (user_id, achievement_code);
alter table public.user_achievements add constraint user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX audit_logs_admin_user_idx ON public.admin_audit_logs USING btree (admin_user_id);
CREATE INDEX announcements_audience_idx ON public.announcements USING btree (audience);
CREATE INDEX announcements_color_priority_idx ON public.announcements USING btree (color_key, priority, announcement_date, created_at);
CREATE INDEX announcements_created_at_idx ON public.announcements USING btree (created_at DESC);
CREATE INDEX announcements_event_id_idx ON public.announcements USING btree (event_id);
CREATE INDEX announcements_visibility_idx ON public.announcements USING btree (audience, is_published, archived_at, created_at DESC);
CREATE INDEX dog_documents_dog_idx ON public.dog_documents USING btree (dog_id);
CREATE INDEX dog_documents_status_idx ON public.dog_documents USING btree (status, expires_on);
CREATE INDEX dogs_user_id_idx ON public.dogs USING btree (user_id);
CREATE INDEX events_audience_idx ON public.events USING btree (audience);
CREATE INDEX events_calendar_visibility_idx ON public.events USING btree (audience, is_published, archived_at, start_date);
CREATE INDEX events_color_priority_idx ON public.events USING btree (color_key, priority, start_date);
CREATE INDEX events_recurrence_idx ON public.events USING btree (repeat_type, repeat_limit, start_date);
CREATE INDEX events_recurrence_key_idx ON public.events USING btree (recurrence_key);
CREATE INDEX events_start_date_idx ON public.events USING btree (start_date);
CREATE INDEX events_visibility_idx ON public.events USING btree (audience, is_published, archived_at, start_date);
CREATE INDEX member_visits_date_idx ON public.member_visits USING btree (visit_date DESC);
CREATE INDEX member_visits_membership_visited_idx ON public.member_visits USING btree (membership_id, visited_at DESC);
CREATE INDEX member_visits_user_visited_idx ON public.member_visits USING btree (user_id, visited_at DESC);
CREATE INDEX membership_delete_requests_membership_idx ON public.membership_delete_requests USING btree (membership_id);
CREATE INDEX membership_delete_requests_status_idx ON public.membership_delete_requests USING btree (status, requested_at);
CREATE INDEX memberships_admin_status_idx ON public.memberships USING btree (status, current_payment_status, end_date, created_at DESC);
CREATE INDEX memberships_member_number_idx ON public.memberships USING btree (member_number);
CREATE UNIQUE INDEX memberships_member_number_unique_idx ON public.memberships USING btree (member_number) WHERE (member_number IS NOT NULL);
CREATE INDEX memberships_payment_status_idx ON public.memberships USING btree (current_payment_status);
CREATE INDEX memberships_qr_token_idx ON public.memberships USING btree (qr_token);
CREATE UNIQUE INDEX memberships_qr_token_unique_idx ON public.memberships USING btree (qr_token);
CREATE INDEX memberships_status_idx ON public.memberships USING btree (status);
CREATE INDEX memberships_user_id_idx ON public.memberships USING btree (user_id);
CREATE INDEX notification_campaigns_created_at_idx ON public.notification_campaigns USING btree (created_at DESC);
CREATE INDEX notification_campaigns_created_by_idx ON public.notification_campaigns USING btree (created_by);
CREATE INDEX notification_campaigns_status_idx ON public.notification_campaigns USING btree (status);
CREATE UNIQUE INDEX notification_class_cancellation_locks_unique ON public.notification_class_cancellation_locks USING btree (enrollment_id, schedule_id, cancellation_date);
CREATE UNIQUE INDEX notification_class_reminder_locks_unique ON public.notification_class_reminder_locks USING btree (enrollment_id, schedule_id, class_date, reminder_type);
CREATE INDEX notification_deliveries_campaign_id_idx ON public.notification_deliveries USING btree (campaign_id);
CREATE INDEX notification_deliveries_status_idx ON public.notification_deliveries USING btree (status);
CREATE INDEX notification_deliveries_user_id_idx ON public.notification_deliveries USING btree (user_id);
CREATE INDEX notification_tokens_active_idx ON public.notification_tokens USING btree (is_active) WHERE (is_active = true);
CREATE INDEX notification_tokens_user_id_idx ON public.notification_tokens USING btree (user_id);
CREATE INDEX payment_obligations_membership_idx ON public.payment_obligations USING btree (membership_id, period_start);
CREATE INDEX payment_obligations_user_due_idx ON public.payment_obligations USING btree (user_id, due_date);
CREATE INDEX payments_membership_id_idx ON public.payments USING btree (membership_id);
CREATE INDEX payments_obligation_idx ON public.payments USING btree (obligation_id);
CREATE INDEX payments_status_idx ON public.payments USING btree (status);
CREATE INDEX payments_user_id_idx ON public.payments USING btree (user_id);
CREATE INDEX payments_user_id_paid_at_idx ON public.payments USING btree (user_id, paid_at DESC);
CREATE INDEX practice_sessions_dog_completed_idx ON public.practice_sessions USING btree (dog_id, completed_at DESC);
CREATE INDEX practice_sessions_enrollment_completed_idx ON public.practice_sessions USING btree (enrollment_id, completed_at DESC);
CREATE UNIQUE INDEX practice_sessions_user_client_event_uidx ON public.practice_sessions USING btree (user_id, client_event_id) WHERE (client_event_id IS NOT NULL);
CREATE INDEX practice_sessions_user_completed_idx ON public.practice_sessions USING btree (user_id, completed_at DESC);
CREATE INDEX profiles_deletion_requested_idx ON public.profiles USING btree (deletion_requested_at) WHERE (deletion_requested_at IS NOT NULL);
CREATE INDEX profiles_email_idx ON public.profiles USING btree (email);
CREATE INDEX profiles_role_idx ON public.profiles USING btree (role);
CREATE INDEX profiles_user_id_idx ON public.profiles USING btree (user_id);
CREATE UNIQUE INDEX program_attendances_enrollment_date_unique_idx ON public.program_attendances USING btree (enrollment_id, attendance_date);
CREATE INDEX program_attendances_enrollment_idx ON public.program_attendances USING btree (enrollment_id);
CREATE UNIQUE INDEX program_attendances_session_enrollment_unique_idx ON public.program_attendances USING btree (session_id, enrollment_id) WHERE (session_id IS NOT NULL);
CREATE INDEX program_attendances_session_idx ON public.program_attendances USING btree (session_id);
CREATE UNIQUE INDEX program_class_cancellations_active_unique ON public.program_class_cancellations USING btree (schedule_id, cancellation_date) WHERE (restored_at IS NULL);
CREATE INDEX program_class_cancellations_schedule_date_idx ON public.program_class_cancellations USING btree (schedule_id, cancellation_date);
CREATE INDEX program_enrollments_dog_idx ON public.program_enrollments USING btree (dog_id);
CREATE UNIQUE INDEX program_enrollments_program_card_unique_idx ON public.program_enrollments USING btree (program_id, lower(btrim(physical_card_number))) WHERE ((physical_card_number IS NOT NULL) AND (btrim(physical_card_number) <> ''::text));
CREATE INDEX program_enrollments_program_idx ON public.program_enrollments USING btree (program_id);
CREATE INDEX program_enrollments_schedule_idx ON public.program_enrollments USING btree (schedule_id);
CREATE INDEX program_enrollments_status_idx ON public.program_enrollments USING btree (status);
CREATE INDEX program_enrollments_user_idx ON public.program_enrollments USING btree (user_id);
CREATE INDEX program_exams_enrollment_idx ON public.program_exams USING btree (enrollment_id, requested_at DESC);
CREATE INDEX program_exams_status_idx ON public.program_exams USING btree (status, scheduled_at);
CREATE INDEX program_schedule_versions_lookup_idx ON public.program_schedule_versions USING btree (schedule_id, effective_from, effective_to) WHERE (retired_at IS NULL);
CREATE UNIQUE INDEX program_schedule_versions_schedule_from_unique ON public.program_schedule_versions USING btree (schedule_id, effective_from) WHERE (retired_at IS NULL);
CREATE UNIQUE INDEX program_schedules_program_name_idx ON public.program_schedules USING btree (program_id, name);
CREATE INDEX program_sessions_date_idx ON public.program_sessions USING btree (session_date, scheduled_start_time);
CREATE INDEX program_sessions_schedule_idx ON public.program_sessions USING btree (schedule_id, session_date);
CREATE INDEX user_achievements_code_idx ON public.user_achievements USING btree (achievement_code);
CREATE INDEX user_achievements_user_idx ON public.user_achievements USING btree (user_id);

CREATE OR REPLACE FUNCTION public.admin_change_program_schedule_from_date(p_schedule_id uuid, p_effective_from date, p_name text, p_day_of_week integer, p_start_time time without time zone, p_repeat_type text, p_cycle_start_date date DEFAULT NULL::date, p_sequence_order integer DEFAULT 1, p_is_active boolean DEFAULT true, p_change_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_new_version_id uuid;
  v_cycle_start date;
  v_now timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden cambiar horarios.';
  end if;

  if p_effective_from is null or p_effective_from < (clock_timestamp() at time zone 'America/Mexico_City')::date then
    raise exception 'El cambio debe iniciar hoy o en una fecha futura. El historial no se reescribe.';
  end if;

  if p_day_of_week < 0 or p_day_of_week > 6 then
    raise exception 'Dia de semana invalido.';
  end if;

  if p_repeat_type not in ('weekly','biweekly') then
    raise exception 'Repeticion invalida.';
  end if;

  if p_start_time is null then
    raise exception 'La hora es obligatoria.';
  end if;

  perform 1
  from public.program_schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'Horario no encontrado.';
  end if;

  if exists (
    select 1
    from public.program_sessions ps
    where ps.schedule_id = p_schedule_id
      and ps.session_date = p_effective_from
  ) then
    raise exception 'Ese dia ya tiene una sesion real. Inicia el cambio en una fecha posterior.';
  end if;

  v_cycle_start := case
    when p_repeat_type = 'biweekly' then coalesce(p_cycle_start_date, p_effective_from)
    else null
  end;

  update public.program_schedule_versions
  set retired_at = v_now,
      retired_by = v_user_id
  where schedule_id = p_schedule_id
    and retired_at is null
    and effective_from >= p_effective_from;

  update public.program_schedule_versions
  set effective_to = p_effective_from - 1
  where schedule_id = p_schedule_id
    and retired_at is null
    and effective_from < p_effective_from
    and (effective_to is null or effective_to >= p_effective_from);

  insert into public.program_schedule_versions (
    schedule_id, effective_from, effective_to, name, day_of_week, start_time,
    repeat_type, cycle_start_date, sequence_order, is_active, change_note, created_by
  ) values (
    p_schedule_id, p_effective_from, null,
    coalesce(nullif(btrim(p_name), ''), 'Horario'), p_day_of_week, p_start_time,
    p_repeat_type, v_cycle_start, greatest(1, coalesce(p_sequence_order, 1)),
    coalesce(p_is_active, true), nullif(btrim(p_change_note), ''), v_user_id
  )
  returning id into v_new_version_id;

  update public.announcements a
  set is_published = false,
      archived_at = coalesce(a.archived_at, v_now)
  where a.id in (
    select c.announcement_id
    from public.program_class_cancellations c
    where c.schedule_id = p_schedule_id
      and c.cancellation_date >= p_effective_from
      and c.restored_at is null
      and c.announcement_id is not null
  );

  update public.program_class_cancellations
  set restored_at = v_now,
      restored_by = v_user_id,
      updated_at = v_now
  where schedule_id = p_schedule_id
    and cancellation_date >= p_effective_from
    and restored_at is null;

  delete from public.notification_class_reminder_locks
  where schedule_id = p_schedule_id
    and class_date >= p_effective_from
    and sent_at is null;

  delete from public.notification_class_cancellation_locks
  where schedule_id = p_schedule_id
    and cancellation_date >= p_effective_from
    and sent_at is null;

  return v_new_version_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.admin_create_basic_dog(p_user_id uuid, p_name text)
 RETURNS TABLE(id uuid, name text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_dog public.dogs%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden registrar perros para clientes.'; end if;
  if p_user_id is null or not exists (select 1 from public.profiles p where p.user_id = p_user_id) then
    raise exception 'Cliente no encontrado.';
  end if;
  if v_name = '' then raise exception 'El nombre del perro es obligatorio.'; end if;
  insert into public.dogs (user_id, name, is_active) values (p_user_id, v_name, true) returning * into v_dog;
  return query select v_dog.id, v_dog.name, v_dog.is_active, v_dog.created_at, v_dog.updated_at;
end;
$function$

CREATE OR REPLACE FUNCTION public.correct_member_visit_admin(p_visit_id uuid, p_visited_at timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden corregir visitas.'; end if;
  update public.member_visits
  set visited_at = p_visited_at,
      visit_date = (p_visited_at at time zone 'America/Mexico_City')::date,
      notes = nullif(btrim(p_notes), ''),
      recorded_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id;
  if not found then raise exception 'Visita no encontrada.'; end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.correct_program_attendance_admin(p_attendance_id uuid, p_attendance_date date, p_schedule_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_attendance public.program_attendances%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_session_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden corregir asistencias.'; end if;
  if p_attendance_date > (clock_timestamp() at time zone 'America/Mexico_City')::date then raise exception 'No se puede registrar asistencia en una fecha futura.'; end if;
  select * into v_attendance from public.program_attendances where id = p_attendance_id;
  if not found then raise exception 'Asistencia no encontrada.'; end if;
  select * into v_enrollment from public.program_enrollments where id = v_attendance.enrollment_id;
  if not found then raise exception 'Inscripcion no encontrada.'; end if;
  select * into v_schedule from public.get_effective_program_schedule(p_schedule_id, p_attendance_date) where program_id = v_enrollment.program_id;
  if not found then raise exception 'El horario no pertenece al programa o no existia en esa fecha.'; end if;
  if not public.program_schedule_occurs_on_date(p_schedule_id, p_attendance_date) then raise exception 'La fecha no corresponde al horario y ciclo configurados para esa fecha.'; end if;
  if exists (select 1 from public.program_class_cancellations c where c.schedule_id = p_schedule_id and c.cancellation_date = p_attendance_date and c.restored_at is null) then raise exception 'La clase de esa fecha esta cancelada.'; end if;
  if exists (select 1 from public.program_attendances a where a.enrollment_id = v_attendance.enrollment_id and a.attendance_date = p_attendance_date and a.id <> p_attendance_id) then raise exception 'Ya existe otra asistencia para esta inscripcion en esa fecha.'; end if;
  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (p_schedule_id, p_attendance_date, v_schedule.start_time, auth.uid())
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;
  if v_session_id is null then select id into v_session_id from public.program_sessions where schedule_id = p_schedule_id and session_date = p_attendance_date; end if;
  if exists (select 1 from public.program_attendances a where a.session_id = v_session_id and a.enrollment_id = v_attendance.enrollment_id and a.id <> p_attendance_id) then raise exception 'Ya existe otra asistencia para esta clase.'; end if;
  update public.program_attendances
  set attendance_date = p_attendance_date, session_id = v_session_id, source = 'admin_manual', marked_by = auth.uid(), recorded_at = now(), notes = nullif(btrim(p_notes), ''), updated_at = now()
  where id = p_attendance_id;
  return p_attendance_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.create_my_basic_dog(p_name text)
 RETURNS TABLE(id uuid, name text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_dog public.dogs%rowtype;
begin
  if v_user_id is null then raise exception 'No hay sesion activa.'; end if;
  if v_name = '' then raise exception 'Escribe el nombre de tu perro.'; end if;
  if length(v_name) > 80 then raise exception 'El nombre es demasiado largo.'; end if;
  if v_name ~ '[[:cntrl:]]' then raise exception 'El nombre contiene caracteres no permitidos.'; end if;
  if exists (select 1 from public.dogs d where d.user_id = v_user_id and d.is_active and lower(btrim(d.name)) = lower(v_name)) then raise exception 'Ya tienes un perro activo con ese nombre.'; end if;
  insert into public.dogs (user_id, name, is_active) values (v_user_id, v_name, true) returning * into v_dog;
  update public.profiles p set dog_name = v_name, updated_at = now() where p.user_id = v_user_id and nullif(btrim(p.dog_name), '') is null;
  return query select v_dog.id, v_dog.name, v_dog.is_active, v_dog.created_at, v_dog.updated_at;
end;
$function$

CREATE OR REPLACE FUNCTION public.delete_member_visit_admin(p_visit_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden quitar visitas.'; end if;
  delete from public.member_visits where id = p_visit_id;
  if not found then raise exception 'Visita no encontrada.'; end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.delete_program_attendance_admin(p_attendance_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enrollment_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden quitar asistencias.'; end if;
  select enrollment_id into v_enrollment_id from public.program_attendances where id = p_attendance_id;
  if v_enrollment_id is null then raise exception 'Asistencia no encontrada.'; end if;
  delete from public.program_attendances where id = p_attendance_id;
  perform public.refresh_program_enrollment_progress(v_enrollment_id);
end;
$function$

CREATE OR REPLACE FUNCTION public.disable_notification_token(p_expo_push_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  update public.notification_tokens set is_active = false, disabled_at = now(), updated_at = now() where expo_push_token = p_expo_push_token and user_id = v_user_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.ensure_program_enrollment_dog_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name text := btrim(coalesce(new.dog_name, ''));
  v_linked_name text;
  v_dog_id uuid;
begin
  if new.user_id is null then return new; end if;
  if new.dog_id is not null then
    select d.name into v_linked_name from public.dogs d where d.id = new.dog_id and d.user_id = new.user_id;
    if not found then raise exception 'El perro seleccionado no pertenece a este cliente.'; end if;
    if v_name = '' then new.dog_name := v_linked_name; return new; end if;
    if lower(v_name) = lower(btrim(v_linked_name)) then return new; end if;
    new.dog_id := null;
  end if;
  if v_name = '' then return new; end if;
  if length(v_name) > 80 then raise exception 'El nombre del perro es demasiado largo.'; end if;
  if v_name ~ '[[:cntrl:]]' then raise exception 'El nombre del perro contiene caracteres no permitidos.'; end if;
  select d.id into v_dog_id from public.dogs d where d.user_id = new.user_id and d.is_active and lower(btrim(d.name)) = lower(v_name) order by d.created_at, d.id limit 1;
  if v_dog_id is null then
    insert into public.dogs (user_id, name, is_active) values (new.user_id, v_name, true) returning id into v_dog_id;
    update public.profiles p set dog_name = v_name, updated_at = now() where p.user_id = new.user_id and nullif(btrim(p.dog_name), '') is null;
  end if;
  new.dog_id := v_dog_id;
  new.dog_name := v_name;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_admin_attendance_day(p_date date)
 RETURNS TABLE(attendance_id uuid, attendance_date date, scheduled_start_time time without time zone, session_id uuid, program_code text, program_name text, program_level text, schedule_id uuid, schedule_name text, user_id uuid, client_name text, client_email text, dog_name text, member_number text, physical_card_number text, source text, recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden consultar este reporte.'; end if;
  return query
  select a.id, a.attendance_date, ps.scheduled_start_time, ps.id, p.code, p.name, e.program_level, s.id, coalesce(eff.name, s.name), e.user_id, coalesce(pr.full_name, pr.email, 'Cliente UCAPSA'), pr.email, coalesce(d.name, e.dog_name, pr.dog_name), m.member_number, e.physical_card_number, a.source, a.recorded_at
  from public.program_attendances a
  join public.program_enrollments e on e.id = a.enrollment_id
  join public.programs p on p.id = e.program_id
  left join public.program_sessions ps on ps.id = a.session_id
  left join public.program_schedules s on s.id = ps.schedule_id
  left join lateral public.get_effective_program_schedule(s.id, a.attendance_date) eff on s.id is not null
  left join public.profiles pr on pr.user_id = e.user_id
  left join public.memberships m on m.user_id = e.user_id
  left join public.dogs d on d.id = e.dog_id
  where a.attendance_date = p_date
  order by ps.scheduled_start_time nulls last, p.code, pr.full_name nulls last, e.dog_name nulls last;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_admin_member_visit_monthly_stats(p_months integer DEFAULT 12)
 RETURNS TABLE(month_start date, total_visits integer, unique_members integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden consultar estadisticas de visitas.'; end if;
  return query
  with months as (
    select generate_series(date_trunc('month', (clock_timestamp() at time zone 'America/Mexico_City'))::date - ((greatest(2, least(coalesce(p_months, 12), 24)) - 1) * interval '1 month'), date_trunc('month', (clock_timestamp() at time zone 'America/Mexico_City'))::date, interval '1 month')::date as month_start
  ), aggregated as (
    select date_trunc('month', mv.visit_date::timestamp)::date as month_start, count(*)::int as total_visits, count(distinct mv.user_id)::int as unique_members
    from public.member_visits mv
    where mv.visit_date >= (select min(m.month_start) from months m)
    group by 1
  )
  select m.month_start, coalesce(a.total_visits, 0)::int, coalesce(a.unique_members, 0)::int from months m left join aggregated a using (month_start) order by m.month_start;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_effective_program_schedule(p_schedule_id uuid, p_date date)
 RETURNS TABLE(schedule_id uuid, program_id uuid, name text, day_of_week integer, start_time time without time zone, repeat_type text, cycle_start_date date, sequence_order integer, is_active boolean, effective_from date, effective_to date, version_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.program_id, coalesce(v.name, s.name), coalesce(v.day_of_week, s.day_of_week), coalesce(v.start_time, s.start_time::time), coalesce(v.repeat_type, s.repeat_type), coalesce(v.cycle_start_date, s.cycle_start_date), coalesce(v.sequence_order, s.sequence_order), coalesce(v.is_active, s.is_active), coalesce(v.effective_from, date '1900-01-01'), v.effective_to, v.id
  from public.program_schedules s
  left join lateral (
    select vv.* from public.program_schedule_versions vv
    where vv.schedule_id = s.id and vv.retired_at is null and vv.effective_from <= p_date and (vv.effective_to is null or vv.effective_to >= p_date)
    order by vv.effective_from desc, vv.created_at desc limit 1
  ) v on true
  where s.id = p_schedule_id and (v.id is not null or not exists (select 1 from public.program_schedule_versions any_v where any_v.schedule_id = s.id and any_v.retired_at is null));
$function$

CREATE OR REPLACE FUNCTION public.get_effective_program_schedules(p_date date)
 RETURNS TABLE(id uuid, program_id uuid, name text, day_of_week integer, start_time time without time zone, repeat_type text, cycle_start_date date, sequence_order integer, is_active boolean, effective_from date, effective_to date, version_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select eff.schedule_id, eff.program_id, eff.name, eff.day_of_week, eff.start_time, eff.repeat_type, eff.cycle_start_date, eff.sequence_order, eff.is_active, eff.effective_from, eff.effective_to, eff.version_id
  from public.program_schedules s cross join lateral public.get_effective_program_schedule(s.id, p_date) eff;
$function$

CREATE OR REPLACE FUNCTION public.get_my_basic_dogs()
 RETURNS TABLE(id uuid, name text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select d.id, d.name, d.is_active, d.created_at, d.updated_at
  from public.dogs d
  where d.user_id = auth.uid() and d.is_active
  order by d.created_at, d.name, d.id;
$function$

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select role
from public.profiles
where user_id = auth.uid()
limit 1;
$function$

CREATE OR REPLACE FUNCTION public.guard_program_exam_client_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.status := 'requested';
    new.requested_by := auth.uid();
    new.requested_at := coalesce(new.requested_at, now());
    new.scheduled_at := null;
    new.completed_at := null;
    new.result_notes := null;
    new.reviewed_by := null;
    new.target_level := null;
    new.promotion_applied_at := null;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (
    user_id,
    full_name,
    email,
    role
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'client'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.has_active_membership()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select exists (
  select 1
  from public.memberships
  where user_id = auth.uid()
    and status = 'active'
    and (start_date is null or start_date <= current_date)
    and (end_date is null or end_date >= current_date)
);
$function$

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select exists (
  select 1
  from public.profiles
  where user_id = auth.uid()
    and role in ('admin', 'super_admin')
);
$function$

CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select enabled from public.feature_flags where code = p_code), false);
$function$

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select exists (
  select 1
  from public.profiles
  where user_id = auth.uid()
    and role = 'super_admin'
);
$function$

CREATE OR REPLACE FUNCTION public.is_ucapsa_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin', 'super_admin')
  );
$function$

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- Permite cambios desde SQL Editor / service role.
  -- Esto sirve para crear el primer super_admin manualmente.
  if auth.uid() is null then
    return new;
  end if;

  -- Nadie puede cambiar el user_id del perfil.
  if old.user_id is distinct from new.user_id then
    raise exception 'No puedes cambiar el user_id del perfil.';
  end if;

  -- Un usuario normal no debe cambiar el email guardado en profiles.
  if old.email is distinct from new.email and not public.is_admin() then
    raise exception 'No puedes cambiar el email del perfil.';
  end if;

  -- Si cambia el rol, debe hacerlo admin o super_admin.
  if old.role is distinct from new.role then
    if not public.is_admin() then
      raise exception 'No tienes permiso para cambiar roles.';
    end if;

    -- Solo super_admin puede crear o modificar admins/super_admins.
    if (
      old.role in ('admin', 'super_admin')
      or new.role in ('admin', 'super_admin')
    ) and not public.is_super_admin() then
      raise exception 'Solo super_admin puede modificar roles administrativos.';
    end if;
  end if;

  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.program_schedule_occurs_on_date(p_schedule_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_schedule record;
  v_diff_weeks integer;
begin
  select * into v_schedule
  from public.get_effective_program_schedule(p_schedule_id, p_date);

  if not found or not coalesce(v_schedule.is_active, false) then
    return false;
  end if;

  if extract(dow from p_date)::int <> v_schedule.day_of_week then
    return false;
  end if;

  if v_schedule.repeat_type = 'biweekly' then
    if v_schedule.cycle_start_date is null or p_date < v_schedule.cycle_start_date then
      return false;
    end if;
    v_diff_weeks := floor((p_date - v_schedule.cycle_start_date)::numeric / 7)::int;
    if mod(v_diff_weeks, 2) <> 0 then
      return false;
    end if;
  end if;

  return true;
end;
$function$

CREATE OR REPLACE FUNCTION public.refresh_program_enrollment_progress(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_program_id uuid;
  v_required integer;
  v_count integer;
  v_latest date;
  v_schedule_count integer;
  v_target_offset integer;
  v_next_schedule_id uuid;
begin
  select e.program_id, p.required_attendances
    into v_program_id, v_required
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id
  where e.id = p_enrollment_id;

  if v_program_id is null then
    return;
  end if;

  select count(*)::int, max(attendance_date)
    into v_count, v_latest
  from public.program_attendances
  where enrollment_id = p_enrollment_id;

  select count(*)::int
    into v_schedule_count
  from public.program_schedules s
  join lateral public.get_effective_program_schedule(s.id, (clock_timestamp() at time zone 'America/Mexico_City')::date) e on true
  where s.program_id = v_program_id
    and e.is_active = true;

  if v_schedule_count > 0 then
    v_target_offset := least(v_count, v_schedule_count - 1);

    select s.id
      into v_next_schedule_id
    from public.program_schedules s
    join lateral public.get_effective_program_schedule(s.id, (clock_timestamp() at time zone 'America/Mexico_City')::date) e on true
    where s.program_id = v_program_id
      and e.is_active = true
    order by e.sequence_order, e.day_of_week, e.start_time
    offset v_target_offset
    limit 1;
  end if;

  update public.program_enrollments
  set attendances_count = v_count,
      last_attendance_at = v_latest,
      schedule_id = coalesce(v_next_schedule_id, schedule_id),
      requirements_met_at = case
        when v_count >= greatest(1, v_required) then coalesce(requirements_met_at, now())
        else null
      end,
      updated_at = now()
  where id = p_enrollment_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_member_visit_admin(p_user_id uuid, p_visited_at timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_membership public.memberships%rowtype;
  v_visit_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden registrar visitas.'; end if;

  select * into v_membership
  from public.memberships
  where user_id = p_user_id
    and status = 'active'
  order by created_at desc
  limit 1;
  if not found then raise exception 'El usuario no tiene una membresia activa.'; end if;

  insert into public.member_visits (user_id, membership_id, visited_at, visit_date, source, recorded_by, notes)
  values (
    p_user_id,
    v_membership.id,
    coalesce(p_visited_at, now()),
    (coalesce(p_visited_at, now()) at time zone 'America/Mexico_City')::date,
    'admin_manual',
    auth.uid(),
    nullif(btrim(p_notes), '')
  ) returning id into v_visit_id;
  return v_visit_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_member_visit_from_qr(p_qr_token text)
 RETURNS TABLE(visit_id uuid, result text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships%rowtype;
  v_visit_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    return query select null::uuid, 'not_authenticated'::text, 'No hay sesion activa.'::text;
    return;
  end if;

  if not exists (
    select 1 from public.attendance_qr_codes q
    where q.program_code = 'member'
      and q.token::text = btrim(p_qr_token)
      and q.is_active = true
  ) then
    return query select null::uuid, 'invalid_qr'::text, 'QR de Socios UCAPSA no valido.'::text;
    return;
  end if;

  select * into v_membership
  from public.memberships
  where user_id = v_user_id
    and status = 'active'
  order by created_at desc
  limit 1;

  if not found then
    return query select null::uuid, 'membership_not_active'::text, 'Tu membresia no esta activa.'::text;
    return;
  end if;

  insert into public.member_visits (
    user_id, membership_id, visited_at, visit_date, source, recorded_by, notes
  ) values (
    v_user_id,
    v_membership.id,
    v_now,
    (v_now at time zone 'America/Mexico_City')::date,
    'qr_member',
    v_user_id,
    null
  ) returning id into v_visit_id;

  return query select v_visit_id, 'registered'::text, 'Visita de socio registrada.'::text;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_my_practice_session(p_client_event_id uuid, p_enrollment_id uuid, p_started_at timestamp with time zone, p_completed_at timestamp with time zone, p_difficulty text, p_note text DEFAULT NULL::text, p_duration_seconds integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.program_enrollments%rowtype;
  v_existing_id uuid;
  v_practice_id uuid;
begin
  if v_user_id is null then
    raise exception 'No hay sesión activa.';
  end if;
  if p_client_event_id is null then
    raise exception 'Falta el identificador de la práctica.';
  end if;
  if p_enrollment_id is null then
    raise exception 'Falta la inscripción de la práctica.';
  end if;
  if p_difficulty not in ('easy', 'good', 'hard') then
    raise exception 'La dificultad de la práctica no es válida.';
  end if;
  if p_started_at is null or p_completed_at is null or p_completed_at < p_started_at then
    raise exception 'Las horas de la práctica no son válidas.';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'La duración de la práctica no es válida.';
  end if;

  select ps.id into v_existing_id
  from public.practice_sessions ps
  where ps.user_id = v_user_id
    and ps.client_event_id = p_client_event_id
  limit 1;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select * into v_enrollment
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.user_id = v_user_id
    and e.status = 'active'
  limit 1;
  if not found then
    raise exception 'La inscripción ya no está activa o no pertenece a tu cuenta.';
  end if;

  begin
    insert into public.practice_sessions (
      user_id, dog_id, enrollment_id, client_event_id, started_at, completed_at, difficulty, note, duration_seconds
    ) values (
      v_user_id, v_enrollment.dog_id, v_enrollment.id, p_client_event_id, p_started_at, p_completed_at, p_difficulty,
      nullif(btrim(coalesce(p_note, '')), ''), p_duration_seconds
    ) returning id into v_practice_id;
  exception
    when unique_violation then
      select ps.id into v_practice_id
      from public.practice_sessions ps
      where ps.user_id = v_user_id
        and ps.client_event_id = p_client_event_id
      limit 1;
  end;

  if v_practice_id is null then
    raise exception 'No se pudo confirmar la práctica.';
  end if;
  return v_practice_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_program_attendance_admin(p_enrollment_id uuid, p_attendance_date date, p_schedule_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_schedule_id uuid;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden registrar asistencia manual.';
  end if;
  if p_attendance_date > (clock_timestamp() at time zone 'America/Mexico_City')::date then
    raise exception 'No se puede registrar asistencia en una fecha futura.';
  end if;

  select * into v_enrollment from public.program_enrollments where id = p_enrollment_id;
  if not found then raise exception 'Inscripcion no encontrada.'; end if;

  v_schedule_id := coalesce(p_schedule_id, v_enrollment.schedule_id);
  select * into v_schedule
  from public.get_effective_program_schedule(v_schedule_id, p_attendance_date)
  where program_id = v_enrollment.program_id;

  if not found then raise exception 'El horario no pertenece al programa o no existia en esa fecha.'; end if;
  if not public.program_schedule_occurs_on_date(v_schedule_id, p_attendance_date) then
    raise exception 'La fecha no corresponde al horario y ciclo configurados para esa fecha.';
  end if;
  if exists (
    select 1 from public.program_class_cancellations c
    where c.schedule_id = v_schedule_id and c.cancellation_date = p_attendance_date and c.restored_at is null
  ) then raise exception 'La clase de esa fecha esta cancelada.'; end if;

  select id into v_attendance_id
  from public.program_attendances
  where enrollment_id = p_enrollment_id and attendance_date = p_attendance_date
  order by created_at asc limit 1;
  if v_attendance_id is not null then return v_attendance_id; end if;

  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (v_schedule_id, p_attendance_date, v_schedule.start_time, auth.uid())
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id into v_session_id from public.program_sessions
    where schedule_id = v_schedule_id and session_date = p_attendance_date;
  end if;

  select id into v_attendance_id
  from public.program_attendances
  where session_id = v_session_id and enrollment_id = p_enrollment_id;
  if v_attendance_id is not null then return v_attendance_id; end if;

  insert into public.program_attendances (
    enrollment_id, attendance_date, session_id, source, marked_by, recorded_at, notes
  ) values (
    p_enrollment_id, p_attendance_date, v_session_id, 'admin_manual', auth.uid(), now(), nullif(btrim(p_notes), '')
  ) returning id into v_attendance_id;
  return v_attendance_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_program_attendance_from_qr(p_qr_token text, p_enrollment_id uuid)
 RETURNS TABLE(attendance_id uuid, session_id uuid, result text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_qr public.attendance_qr_codes%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_program_code text;
  v_now_local timestamp without time zone := clock_timestamp() at time zone 'America/Mexico_City';
  v_today date;
  v_class_start timestamp without time zone;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if v_user_id is null then
    raise exception 'No hay sesion activa.';
  end if;
  v_today := v_now_local::date;

  select * into v_qr
  from public.attendance_qr_codes
  where token::text = btrim(p_qr_token)
    and is_active = true;
  if not found then
    return query select null::uuid, null::uuid, 'invalid_qr'::text, 'QR UCAPSA no valido.'::text;
    return;
  end if;

  select * into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id
    and user_id = v_user_id;
  if not found then
    return query select null::uuid, null::uuid, 'not_owner'::text, 'La inscripcion no pertenece a tu cuenta.'::text;
    return;
  end if;
  if v_enrollment.status <> 'active' then
    return query select null::uuid, null::uuid, 'inactive_enrollment'::text, 'La inscripcion no esta activa.'::text;
    return;
  end if;
  if v_enrollment.card_started_on is null or v_enrollment.card_expires_on is null then
    return query select null::uuid, null::uuid, 'card_dates_missing'::text, 'La vigencia de la tarjeta necesita revision administrativa.'::text;
    return;
  end if;
  if v_today < v_enrollment.card_started_on or v_today > v_enrollment.card_expires_on then
    return query select null::uuid, null::uuid, 'card_not_valid'::text, 'La tarjeta no esta vigente.'::text;
    return;
  end if;

  select code into v_program_code
  from public.programs
  where id = v_enrollment.program_id
    and is_active = true;
  if v_program_code is null or v_program_code <> v_qr.program_code then
    return query select null::uuid, null::uuid, 'wrong_program'::text, 'Este QR no corresponde a tu programa activo.'::text;
    return;
  end if;

  select * into v_schedule
  from public.get_effective_program_schedule(v_enrollment.schedule_id, v_today)
  where program_id = v_enrollment.program_id;
  if not found or not coalesce(v_schedule.is_active, false) then
    return query select null::uuid, null::uuid, 'schedule_not_found'::text, 'No hay horario activo para esta inscripcion.'::text;
    return;
  end if;

  if not public.program_schedule_occurs_on_date(v_enrollment.schedule_id, v_today) then
    if extract(dow from v_today)::int <> v_schedule.day_of_week then
      return query select null::uuid, null::uuid, 'wrong_day'::text, 'Hoy no corresponde a esta clase.'::text;
    end if;
    return query select null::uuid, null::uuid, 'wrong_cycle'::text, 'Esta semana no corresponde a la clase.'::text;
    return;
  end if;

  if exists (
    select 1 from public.program_class_cancellations c
    where c.schedule_id = v_schedule.schedule_id
      and c.cancellation_date = v_today
      and c.restored_at is null
  ) then
    return query select null::uuid, null::uuid, 'cancelled'::text, 'La clase de hoy esta cancelada.'::text;
    return;
  end if;

  v_class_start := v_today::timestamp + v_schedule.start_time;
  if v_now_local < v_class_start - make_interval(mins => v_qr.window_before_minutes)
     or v_now_local > v_class_start + make_interval(mins => v_qr.window_after_minutes) then
    return query select null::uuid, null::uuid, 'outside_window'::text, 'El registro de asistencia no esta disponible en este horario.'::text;
    return;
  end if;

  select a.id into v_attendance_id
  from public.program_attendances a
  where a.enrollment_id = v_enrollment.id
    and a.attendance_date = v_today
  order by a.created_at asc
  limit 1;
  if v_attendance_id is not null then
    return query select v_attendance_id, null::uuid, 'already_registered'::text, 'Tu asistencia de hoy ya estaba registrada.'::text;
    return;
  end if;

  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (v_schedule.schedule_id, v_today, v_schedule.start_time, v_user_id)
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;
  if v_session_id is null then
    select id into v_session_id from public.program_sessions where schedule_id = v_schedule.schedule_id and session_date = v_today;
  end if;

  select a.id into v_attendance_id
  from public.program_attendances a
  where a.session_id = v_session_id
    and a.enrollment_id = v_enrollment.id;
  if v_attendance_id is not null then
    return query select v_attendance_id, v_session_id, 'already_registered'::text, 'Tu asistencia ya estaba registrada.'::text;
    return;
  end if;

  insert into public.program_attendances (
    enrollment_id, attendance_date, session_id, source, marked_by, recorded_at, notes
  ) values (
    v_enrollment.id, v_today, v_session_id, 'qr_client', v_user_id, now(), null
  ) returning id into v_attendance_id;
  return query select v_attendance_id, v_session_id, 'registered'::text, 'Asistencia registrada.'::text;
end;
$function$

CREATE OR REPLACE FUNCTION public.register_program_attendance_from_qr(p_qr_token text, p_enrollment_id uuid, p_confirm_outside_window boolean)
 RETURNS TABLE(attendance_id uuid, session_id uuid, result text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_qr public.attendance_qr_codes%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_program_code text;
  v_now_local timestamp without time zone := clock_timestamp() at time zone 'America/Mexico_City';
  v_today date;
  v_class_start timestamp without time zone;
  v_outside_window boolean := false;
  v_window_start timestamp without time zone;
  v_window_end timestamp without time zone;
  v_session_id uuid;
  v_attendance_id uuid;
begin
  if v_user_id is null then raise exception 'No hay sesion activa.'; end if;
  v_today := v_now_local::date;
  select * into v_qr from public.attendance_qr_codes where token::text = btrim(p_qr_token) and is_active = true;
  if not found or v_qr.program_code = 'member' then return query select null::uuid, null::uuid, 'invalid_qr'::text, 'QR de asistencia UCAPSA no valido.'::text; return; end if;
  select * into v_enrollment from public.program_enrollments where id = p_enrollment_id and user_id = v_user_id;
  if not found then return query select null::uuid, null::uuid, 'not_owner'::text, 'La inscripcion no pertenece a tu cuenta.'::text; return; end if;
  if v_enrollment.status <> 'active' then return query select null::uuid, null::uuid, 'inactive_enrollment'::text, 'La inscripcion no esta activa.'::text; return; end if;
  if v_enrollment.card_started_on is null or v_enrollment.card_expires_on is null then return query select null::uuid, null::uuid, 'card_dates_missing'::text, 'La vigencia de la tarjeta necesita revision administrativa.'::text; return; end if;
  if v_today < v_enrollment.card_started_on or v_today > v_enrollment.card_expires_on then return query select null::uuid, null::uuid, 'card_not_valid'::text, 'La tarjeta no esta vigente.'::text; return; end if;
  select code into v_program_code from public.programs where id = v_enrollment.program_id and is_active = true;
  if v_program_code is null or v_program_code <> v_qr.program_code then return query select null::uuid, null::uuid, 'wrong_program'::text, 'Este QR no corresponde a tu programa activo.'::text; return; end if;
  select * into v_schedule from public.get_effective_program_schedule(v_enrollment.schedule_id, v_today) where program_id = v_enrollment.program_id;
  if not found or not coalesce(v_schedule.is_active, false) then return query select null::uuid, null::uuid, 'schedule_not_found'::text, 'No hay horario activo para esta inscripcion.'::text; return; end if;
  if not public.program_schedule_occurs_on_date(v_enrollment.schedule_id, v_today) then
    if extract(dow from v_today)::int <> v_schedule.day_of_week then return query select null::uuid, null::uuid, 'wrong_day'::text, 'Hoy no corresponde a esta clase.'::text; return; end if;
    return query select null::uuid, null::uuid, 'wrong_cycle'::text, 'Esta semana no corresponde a la clase.'::text; return;
  end if;
  if exists (select 1 from public.program_class_cancellations c where c.schedule_id = v_schedule.schedule_id and c.cancellation_date = v_today and c.restored_at is null) then return query select null::uuid, null::uuid, 'cancelled'::text, 'La clase de hoy esta cancelada.'::text; return; end if;
  select a.id into v_attendance_id from public.program_attendances a where a.enrollment_id = v_enrollment.id and a.attendance_date = v_today order by a.created_at asc limit 1;
  if v_attendance_id is not null then return query select v_attendance_id, null::uuid, 'already_registered'::text, 'Tu asistencia de hoy ya estaba registrada.'::text; return; end if;
  v_class_start := v_today::timestamp + v_schedule.start_time;
  v_window_start := v_class_start - make_interval(mins => v_qr.window_before_minutes);
  v_window_end := v_class_start + make_interval(mins => v_qr.window_after_minutes);
  v_outside_window := v_now_local < v_window_start or v_now_local > v_window_end;
  if v_outside_window and not coalesce(p_confirm_outside_window, false) then
    return query select null::uuid, null::uuid, 'outside_window_confirmation_required'::text,
      format('El horario habitual era de %s a %s para la clase de %s. Puedes registrarla de todos modos; consumira una asistencia.', to_char(v_window_start, 'HH24:MI'), to_char(v_window_end, 'HH24:MI'), to_char(v_class_start, 'HH24:MI'))::text;
    return;
  end if;
  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (v_schedule.schedule_id, v_today, v_schedule.start_time, v_user_id)
  on conflict (schedule_id, session_date) do nothing returning id into v_session_id;
  if v_session_id is null then select id into v_session_id from public.program_sessions where schedule_id = v_schedule.schedule_id and session_date = v_today; end if;
  select a.id into v_attendance_id from public.program_attendances a where a.session_id = v_session_id and a.enrollment_id = v_enrollment.id;
  if v_attendance_id is not null then return query select v_attendance_id, v_session_id, 'already_registered'::text, 'Tu asistencia ya estaba registrada.'::text; return; end if;
  insert into public.program_attendances (enrollment_id, attendance_date, session_id, source, marked_by, recorded_at, notes, outside_window)
  values (v_enrollment.id, v_today, v_session_id, 'qr_client', v_user_id, now(), null, v_outside_window) returning id into v_attendance_id;
  return query select v_attendance_id, v_session_id, 'registered'::text, case when v_outside_window then 'Asistencia registrada fuera del horario habitual.' else 'Asistencia registrada.' end::text;
end;
$function$

CREATE OR REPLACE FUNCTION public.rename_my_basic_dog(p_dog_id uuid, p_name text)
 RETURNS TABLE(id uuid, name text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_old_name text;
  v_dog public.dogs%rowtype;
begin
  if v_user_id is null then raise exception 'No hay sesion activa.'; end if;
  if p_dog_id is null then raise exception 'No se encontro el perro.'; end if;
  if v_name = '' then raise exception 'Escribe el nombre de tu perro.'; end if;
  if length(v_name) > 80 then raise exception 'El nombre es demasiado largo.'; end if;
  if v_name ~ '[[:cntrl:]]' then raise exception 'El nombre contiene caracteres no permitidos.'; end if;
  select d.name into v_old_name from public.dogs d where d.id = p_dog_id and d.user_id = v_user_id and d.is_active;
  if not found then raise exception 'No se encontro el perro en tu cuenta.'; end if;
  if exists (select 1 from public.dogs d where d.user_id = v_user_id and d.is_active and d.id <> p_dog_id and lower(btrim(d.name)) = lower(v_name)) then raise exception 'Ya tienes otro perro activo con ese nombre.'; end if;
  update public.dogs d set name = v_name, updated_at = now() where d.id = p_dog_id and d.user_id = v_user_id returning d.* into v_dog;
  update public.program_enrollments e set dog_name = v_name, updated_at = now() where e.user_id = v_user_id and e.dog_id = p_dog_id;
  update public.profiles p set dog_name = v_name, updated_at = now() where p.user_id = v_user_id and lower(btrim(coalesce(p.dog_name, ''))) = lower(btrim(v_old_name));
  return query select v_dog.id, v_dog.name, v_dog.is_active, v_dog.created_at, v_dog.updated_at;
end;
$function$

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$function$

CREATE OR REPLACE FUNCTION public.rotate_attendance_qr_code(p_program_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token uuid;
begin
  if not public.is_super_admin() then raise exception 'Solo super_admin puede reemplazar un QR oficial.'; end if;
  if p_program_code not in ('puppy','comandos','member') then raise exception 'Programa QR no valido.'; end if;
  update public.attendance_qr_codes
  set token = gen_random_uuid(), version = version + 1, rotated_at = now(), updated_at = now(), updated_by = auth.uid()
  where program_code = p_program_code returning token into v_token;
  if v_token is null then raise exception 'QR oficial no encontrado.'; end if;
  return v_token;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_config_updated_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_program_enrollment_card_validity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' and new.card_started_on is null then
    new.card_started_on := coalesce(new.started_at::date, current_date);
  elsif tg_op = 'UPDATE' and new.card_started_on is null and new.started_at is not null then
    new.card_started_on := new.started_at::date;
  end if;
  if new.card_expires_on is null and new.card_started_on is not null then new.card_expires_on := (new.card_started_on + interval '1 year')::date; end if;
  if new.card_started_on is not null and new.card_expires_on is not null and new.card_expires_on < new.card_started_on then raise exception 'La fecha de vencimiento no puede ser anterior al inicio de la tarjeta.'; end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email, updated_at = now() where user_id = new.id;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.sync_program_enrollment_dog_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.name is distinct from old.name then
    update public.program_enrollments set dog_name = new.name, updated_at = now() where dog_id = new.id;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.trg_refresh_program_enrollment_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_program_enrollment_progress(old.enrollment_id);
    return old;
  end if;
  perform public.refresh_program_enrollment_progress(new.enrollment_id);
  if tg_op = 'UPDATE' and old.enrollment_id is distinct from new.enrollment_id then perform public.refresh_program_enrollment_progress(old.enrollment_id); end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.ucapsa_achievement_code_for_enrollment(p_enrollment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_program_code text;
  v_program_level text;
begin
  select p.code, e.program_level into v_program_code, v_program_level
  from public.program_enrollments e join public.programs p on p.id = e.program_id where e.id = p_enrollment_id;
  if v_program_code = 'puppy' then return 'puppy_completed'; end if;
  if v_program_code = 'comandos' then
    if v_program_level in ('base', 'principiante') then return 'comandos_basico_completed';
    elsif v_program_level = 'medio' then return 'comandos_medio_completed';
    elsif v_program_level = 'avanzado' then return 'comandos_avanzado_completed';
    end if;
  end if;
  return null;
end;
$function$

CREATE OR REPLACE FUNCTION public.ucapsa_award_program_achievement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    v_code := public.ucapsa_achievement_code_for_enrollment(new.id);
    if v_code is not null then
      insert into public.user_achievements (user_id, achievement_code, source_type, source_id, awarded_by)
      values (new.user_id, v_code, 'program_enrollment', new.id, auth.uid())
      on conflict (user_id, achievement_code) do nothing;
    end if;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.upsert_notification_token(p_expo_push_token text, p_platform text DEFAULT 'unknown'::text, p_device_name text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_app_ownership text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text, p_project_id text DEFAULT NULL::text)
 RETURNS notification_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_row public.notification_tokens;
  v_platform text := coalesce(nullif(trim(p_platform), ''), 'unknown');
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if nullif(trim(p_expo_push_token), '') is null then raise exception 'Expo push token requerido'; end if;
  if v_platform not in ('ios', 'android', 'web', 'unknown') then v_platform := 'unknown'; end if;
  update public.notification_tokens
  set user_id = v_user_id, platform = v_platform, device_name = p_device_name, device_id = p_device_id,
      app_ownership = p_app_ownership, app_version = p_app_version, project_id = p_project_id,
      is_active = true, disabled_at = null, last_registered_at = now(), updated_at = now()
  where expo_push_token = p_expo_push_token returning * into v_row;
  if found then return v_row; end if;
  insert into public.notification_tokens (user_id, expo_push_token, platform, device_name, device_id, app_ownership, app_version, project_id)
  values (v_user_id, p_expo_push_token, v_platform, p_device_name, p_device_id, p_app_ownership, p_app_version, p_project_id)
  returning * into v_row;
  return v_row;
end;
$function$

CREATE OR REPLACE FUNCTION public.validate_payment_obligation_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_obligation_user uuid;
  v_obligation_membership uuid;
begin
  if new.obligation_id is null then return new; end if;
  select user_id, membership_id into v_obligation_user, v_obligation_membership
  from public.payment_obligations where id = new.obligation_id;
  if v_obligation_user is null then raise exception 'Obligacion de pago no encontrada.'; end if;
  if new.user_id is distinct from v_obligation_user then raise exception 'El pago y la obligacion pertenecen a usuarios diferentes.'; end if;
  if new.membership_id is null and v_obligation_membership is not null then
    new.membership_id := v_obligation_membership;
  elsif new.membership_id is not null and v_obligation_membership is not null and new.membership_id is distinct from v_obligation_membership then
    raise exception 'La membresia del pago no coincide con la obligacion.';
  end if;
  return new;
end;
$function$

-- Triggers
CREATE TRIGGER set_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_attendance_qr_codes_updated_at BEFORE UPDATE ON attendance_qr_codes FOR EACH ROW EXECUTE FUNCTION set_config_updated_by();
CREATE TRIGGER set_dog_documents_updated_at BEFORE UPDATE ON dog_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_dogs_updated_at BEFORE UPDATE ON dogs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_program_enrollment_dog_name AFTER UPDATE OF name ON dogs FOR EACH ROW EXECUTE FUNCTION sync_program_enrollment_dog_name();
CREATE TRIGGER set_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_feature_flags_updated_at BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION set_config_updated_by();
CREATE TRIGGER set_member_visits_updated_at BEFORE UPDATE ON member_visits FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_membership_billing_profiles_updated_at BEFORE UPDATE ON membership_billing_profiles FOR EACH ROW EXECUTE FUNCTION set_config_updated_by();
CREATE TRIGGER set_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_notification_campaigns_updated_at BEFORE UPDATE ON notification_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER set_notification_deliveries_updated_at BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER set_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER set_notification_tokens_updated_at BEFORE UPDATE ON notification_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER set_payment_obligations_updated_at BEFORE UPDATE ON payment_obligations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_payment_settings_updated_at BEFORE UPDATE ON payment_settings FOR EACH ROW EXECUTE FUNCTION set_config_updated_by();
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validate_payment_obligation_owner BEFORE INSERT OR UPDATE OF obligation_id, user_id, membership_id ON payments FOR EACH ROW EXECUTE FUNCTION validate_payment_obligation_owner();
CREATE TRIGGER set_practice_sessions_updated_at BEFORE UPDATE ON practice_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER prevent_unauthorized_profile_changes_trigger BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION prevent_unauthorized_profile_changes();
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_program_attendances_updated_at BEFORE UPDATE ON program_attendances FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_program_attendances_refresh_progress AFTER INSERT OR DELETE OR UPDATE ON program_attendances FOR EACH ROW EXECUTE FUNCTION trg_refresh_program_enrollment_progress();
CREATE TRIGGER ensure_program_enrollment_dog_link BEFORE INSERT OR UPDATE OF user_id, dog_id, dog_name ON program_enrollments FOR EACH ROW EXECUTE FUNCTION ensure_program_enrollment_dog_link();
CREATE TRIGGER set_program_enrollments_updated_at BEFORE UPDATE ON program_enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_program_enrollment_card_validity BEFORE INSERT OR UPDATE OF started_at, card_started_on, card_expires_on ON program_enrollments FOR EACH ROW EXECUTE FUNCTION set_program_enrollment_card_validity();
CREATE TRIGGER trg_ucapsa_award_program_achievement AFTER INSERT OR UPDATE OF status ON program_enrollments FOR EACH ROW EXECUTE FUNCTION ucapsa_award_program_achievement();
CREATE TRIGGER set_program_exams_updated_at BEFORE UPDATE ON program_exams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_program_exam_client_request_guard BEFORE INSERT ON program_exams FOR EACH ROW EXECUTE FUNCTION guard_program_exam_client_request();
CREATE TRIGGER set_program_sessions_updated_at BEFORE UPDATE ON program_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();

-- RLS state
alter table public.achievement_definitions enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.announcements enable row level security;
alter table public.attendance_qr_codes enable row level security;
alter table public.dog_documents enable row level security;
alter table public.dogs enable row level security;
alter table public.events enable row level security;
alter table public.feature_flags enable row level security;
alter table public.member_visits enable row level security;
alter table public.membership_billing_profiles enable row level security;
alter table public.membership_delete_requests enable row level security;
alter table public.memberships enable row level security;
alter table public.notification_campaigns enable row level security;
alter table public.notification_class_cancellation_locks enable row level security;
alter table public.notification_class_reminder_locks enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_tokens enable row level security;
alter table public.payment_obligations enable row level security;
alter table public.payment_settings enable row level security;
alter table public.payments enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.profiles enable row level security;
alter table public.program_attendances enable row level security;
alter table public.program_class_cancellations enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.program_exams enable row level security;
alter table public.program_schedule_versions enable row level security;
alter table public.program_schedules enable row level security;
alter table public.program_sessions enable row level security;
alter table public.programs enable row level security;
alter table public.user_achievements enable row level security;

-- Policies
create policy achievement_definitions_admin_all on public.achievement_definitions as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy achievement_definitions_select_all on public.achievement_definitions as permissive for select to anon, authenticated using ((is_active = true));
create policy audit_logs_admin_insert on public.admin_audit_logs as permissive for insert to authenticated with check (is_admin());
create policy audit_logs_admin_select on public.admin_audit_logs as permissive for select to authenticated using (is_admin());
create policy announcements_admin_all on public.announcements as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy announcements_select_by_audience on public.announcements as permissive for select to anon, authenticated using (((is_published = true) AND (archived_at IS NULL) AND ((audience = 'public'::audience_type) OR ((auth.uid() IS NOT NULL) AND (audience = 'clients'::audience_type)) OR ((audience = 'members'::audience_type) AND has_active_membership()) OR ((audience = 'admins'::audience_type) AND is_admin()) OR is_admin())));
create policy attendance_qr_codes_admin_select on public.attendance_qr_codes as permissive for select to authenticated using (is_admin());
create policy dog_documents_admin_all on public.dog_documents as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy dog_documents_owner_insert_enabled on public.dog_documents as permissive for insert to authenticated with check ((is_feature_enabled('dog_profiles'::text) AND is_feature_enabled('dog_documents'::text) AND (status = 'pending'::text) AND (uploaded_by = auth.uid()) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (rejection_reason IS NULL) AND (EXISTS (SELECT 1 FROM dogs d WHERE ((d.id = dog_documents.dog_id) AND (d.user_id = auth.uid()))))));
create policy dog_documents_owner_select_enabled on public.dog_documents as permissive for select to authenticated using ((is_feature_enabled('dog_profiles'::text) AND is_feature_enabled('dog_documents'::text) AND (EXISTS (SELECT 1 FROM dogs d WHERE ((d.id = dog_documents.dog_id) AND (d.user_id = auth.uid()))))));
create policy dogs_admin_all on public.dogs as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy dogs_owner_insert_enabled on public.dogs as permissive for insert to authenticated with check ((is_feature_enabled('dog_profiles'::text) AND (user_id = auth.uid())));
create policy dogs_owner_select_enabled on public.dogs as permissive for select to authenticated using ((is_feature_enabled('dog_profiles'::text) AND (user_id = auth.uid())));
create policy dogs_owner_update_enabled on public.dogs as permissive for update to authenticated using ((is_feature_enabled('dog_profiles'::text) AND (user_id = auth.uid()))) with check ((is_feature_enabled('dog_profiles'::text) AND (user_id = auth.uid())));
create policy events_admin_all on public.events as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy events_select_by_audience on public.events as permissive for select to anon, authenticated using (((is_published = true) AND (archived_at IS NULL) AND ((audience = 'public'::audience_type) OR ((auth.uid() IS NOT NULL) AND (audience = 'clients'::audience_type)) OR ((audience = 'members'::audience_type) AND has_active_membership()) OR ((audience = 'admins'::audience_type) AND is_admin()) OR is_admin())));
create policy feature_flags_select_authenticated on public.feature_flags as permissive for select to authenticated using (true);
create policy feature_flags_super_admin_update on public.feature_flags as permissive for update to authenticated using (is_super_admin()) with check (is_super_admin());
create policy member_visits_admin_all on public.member_visits as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy member_visits_own_select on public.member_visits as permissive for select to authenticated using (((user_id = auth.uid()) OR is_admin()));
create policy membership_billing_profiles_admin_all on public.membership_billing_profiles as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy membership_billing_profiles_select_own_or_admin on public.membership_billing_profiles as permissive for select to authenticated using ((is_admin() OR (EXISTS (SELECT 1 FROM memberships m WHERE ((m.id = membership_billing_profiles.membership_id) AND (m.user_id = auth.uid()))))));
create policy membership_delete_requests_admin_insert on public.membership_delete_requests as permissive for insert to authenticated with check (is_admin());
create policy membership_delete_requests_admin_select on public.membership_delete_requests as permissive for select to authenticated using (is_admin());
create policy membership_delete_requests_super_admin_update on public.membership_delete_requests as permissive for update to authenticated using (is_super_admin()) with check (is_super_admin());
create policy memberships_admin_insert on public.memberships as permissive for insert to authenticated with check (is_admin());
create policy memberships_admin_select on public.memberships as permissive for select to authenticated using (is_admin());
create policy memberships_admin_update on public.memberships as permissive for update to authenticated using (is_admin()) with check (is_admin());
create policy memberships_insert_own_pending on public.memberships as permissive for insert to authenticated with check (((user_id = auth.uid()) AND (status = 'pending'::membership_status)));
create policy memberships_select_own_or_admin on public.memberships as permissive for select to authenticated using (((user_id = auth.uid()) OR is_admin()));
create policy memberships_super_admin_delete on public.memberships as permissive for delete to authenticated using (is_super_admin());
create policy "Admins can read notification campaigns" on public.notification_campaigns as permissive for select to authenticated using (is_ucapsa_admin());
create policy notification_campaigns_admin_update on public.notification_campaigns as permissive for update to authenticated using (is_ucapsa_admin()) with check (is_ucapsa_admin());
create policy "Admins can read notification deliveries" on public.notification_deliveries as permissive for select to authenticated using (is_ucapsa_admin());
create policy "Users can insert own notification preferences" on public.notification_preferences as permissive for insert to authenticated with check ((auth.uid() = user_id));
create policy "Users can read own notification preferences" on public.notification_preferences as permissive for select to authenticated using (((auth.uid() = user_id) OR is_ucapsa_admin()));
create policy "Users can update own notification preferences" on public.notification_preferences as permissive for update to authenticated using (((auth.uid() = user_id) OR is_ucapsa_admin())) with check (((auth.uid() = user_id) OR is_ucapsa_admin()));
create policy "Users can insert own notification tokens" on public.notification_tokens as permissive for insert to authenticated with check ((auth.uid() = user_id));
create policy "Users can read own notification tokens" on public.notification_tokens as permissive for select to authenticated using (((auth.uid() = user_id) OR is_ucapsa_admin()));
create policy "Users can update own notification tokens" on public.notification_tokens as permissive for update to authenticated using (((auth.uid() = user_id) OR is_ucapsa_admin())) with check (((auth.uid() = user_id) OR is_ucapsa_admin()));
create policy payment_obligations_admin_all on public.payment_obligations as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy payment_obligations_select_own_or_admin on public.payment_obligations as permissive for select to authenticated using (((user_id = auth.uid()) OR is_admin()));
create policy payment_settings_admin_update on public.payment_settings as permissive for update to authenticated using (is_admin()) with check (is_admin());
create policy payment_settings_authenticated_select on public.payment_settings as permissive for select to authenticated using (((is_active = true) OR is_admin()));
create policy payments_admin_all on public.payments as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy payments_admin_delete on public.payments as permissive for delete to authenticated using (is_admin());
create policy payments_select_own_or_admin on public.payments as permissive for select to authenticated using (((user_id = auth.uid()) OR is_admin()));
create policy practice_sessions_own_insert on public.practice_sessions as permissive for insert to authenticated with check (((user_id = auth.uid()) AND ((dog_id IS NULL) OR (EXISTS (SELECT 1 FROM dogs d WHERE ((d.id = practice_sessions.dog_id) AND (d.user_id = auth.uid()))))) AND ((enrollment_id IS NULL) OR (EXISTS (SELECT 1 FROM program_enrollments e WHERE ((e.id = practice_sessions.enrollment_id) AND (e.user_id = auth.uid())))))));
create policy practice_sessions_own_select on public.practice_sessions as permissive for select to authenticated using (((user_id = auth.uid()) OR is_admin()));
create policy profiles_delete_super_admin on public.profiles as permissive for delete to authenticated using (is_super_admin());
create policy profiles_insert_own on public.profiles as permissive for insert to authenticated with check (((user_id = auth.uid()) AND (role = 'client'::app_role)));
create policy profiles_select_own_or_admin on public.profiles as permissive for select to authenticated using (((user_id = auth.uid()) OR is_admin()));
create policy profiles_update_own_or_admin on public.profiles as permissive for update to authenticated using (((user_id = auth.uid()) OR is_admin())) with check (((user_id = auth.uid()) OR is_admin()));
create policy program_attendances_admin_delete on public.program_attendances as permissive for delete to authenticated using (is_admin());
create policy program_attendances_admin_insert on public.program_attendances as permissive for insert to authenticated with check (is_admin());
create policy program_attendances_admin_update on public.program_attendances as permissive for update to authenticated using (is_admin()) with check (is_admin());
create policy program_attendances_select_own_or_admin on public.program_attendances as permissive for select to authenticated using ((EXISTS (SELECT 1 FROM program_enrollments pe WHERE ((pe.id = program_attendances.enrollment_id) AND ((pe.user_id = auth.uid()) OR is_admin())))));
create policy program_class_cancellations_admin_delete on public.program_class_cancellations as permissive for delete to authenticated using ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.user_id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));
create policy program_class_cancellations_admin_insert on public.program_class_cancellations as permissive for insert to authenticated with check ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.user_id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));
create policy program_class_cancellations_admin_update on public.program_class_cancellations as permissive for update to authenticated using ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.user_id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) with check ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.user_id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));
create policy program_class_cancellations_public_calendar_select on public.program_class_cancellations as permissive for select to anon, authenticated using ((restored_at IS NULL));
create policy program_class_cancellations_public_select on public.program_class_cancellations as permissive for select to anon, authenticated using ((restored_at IS NULL));
create policy program_enrollments_admin_insert on public.program_enrollments as permissive for insert to authenticated with check (is_admin());
create policy program_enrollments_admin_update on public.program_enrollments as permissive for update to authenticated using (is_admin()) with check (is_admin());
create policy program_enrollments_select_own_or_admin on public.program_enrollments as permissive for select to authenticated using (((user_id = auth.uid()) OR is_admin()));
create policy program_enrollments_super_admin_delete on public.program_enrollments as permissive for delete to authenticated using (is_super_admin());
create policy program_exams_admin_all on public.program_exams as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy program_exams_owner_insert_enabled on public.program_exams as permissive for insert to authenticated with check ((is_feature_enabled('exams'::text) AND (requested_by = auth.uid()) AND (status = 'requested'::text) AND (EXISTS (SELECT 1 FROM program_enrollments e WHERE ((e.id = program_exams.enrollment_id) AND (e.user_id = auth.uid()))))));
create policy program_exams_owner_select_enabled on public.program_exams as permissive for select to authenticated using ((is_feature_enabled('exams'::text) AND (EXISTS (SELECT 1 FROM program_enrollments e WHERE ((e.id = program_exams.enrollment_id) AND (e.user_id = auth.uid()))))));
create policy program_schedule_versions_admin_write on public.program_schedule_versions as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy program_schedule_versions_read on public.program_schedule_versions as permissive for select to public using (true);
create policy program_schedules_admin_all on public.program_schedules as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy program_schedules_public_calendar_select on public.program_schedules as permissive for select to anon, authenticated using ((is_active = true));
create policy program_schedules_select_active_or_admin on public.program_schedules as permissive for select to authenticated using ((is_active OR is_admin()));
create policy program_sessions_admin_all on public.program_sessions as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy program_sessions_authenticated_select on public.program_sessions as permissive for select to authenticated using (true);
create policy programs_admin_all on public.programs as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy programs_public_calendar_select on public.programs as permissive for select to anon, authenticated using ((is_active = true));
create policy programs_select_active_or_admin on public.programs as permissive for select to authenticated using ((is_active OR is_admin()));
create policy user_achievements_admin_all on public.user_achievements as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy user_achievements_select_own_or_admin on public.user_achievements as permissive for select to authenticated using (((user_id = auth.uid()) OR is_admin()));
-- Effective table grants, grouped by table and role.
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.achievement_definitions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.achievement_definitions to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.achievement_definitions to service_role;
grant INSERT, SELECT on table public.admin_audit_logs to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.admin_audit_logs to service_role;
grant SELECT on table public.announcements to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public.announcements to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.announcements to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.attendance_qr_codes to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.attendance_qr_codes to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.attendance_qr_codes to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.dog_documents to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.dog_documents to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.dog_documents to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.dogs to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.dogs to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.dogs to service_role;
grant SELECT on table public.events to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public.events to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.events to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.feature_flags to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.feature_flags to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.feature_flags to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.member_visits to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.member_visits to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.member_visits to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.membership_billing_profiles to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.membership_billing_profiles to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.membership_billing_profiles to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.membership_delete_requests to anon;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.membership_delete_requests to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.membership_delete_requests to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.memberships to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.memberships to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.notification_campaigns to anon;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_campaigns to authenticated;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_campaigns to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.notification_class_cancellation_locks to anon;
grant REFERENCES, TRIGGER, TRUNCATE on table public.notification_class_cancellation_locks to authenticated;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_class_cancellation_locks to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.notification_class_reminder_locks to anon;
grant REFERENCES, TRIGGER, TRUNCATE on table public.notification_class_reminder_locks to authenticated;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_class_reminder_locks to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.notification_deliveries to anon;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_deliveries to authenticated;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_deliveries to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.notification_preferences to anon;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_preferences to authenticated;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_preferences to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.notification_tokens to anon;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_tokens to authenticated;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_tokens to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.payment_obligations to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.payment_obligations to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.payment_obligations to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.payment_settings to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.payment_settings to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.payment_settings to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.payments to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.payments to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.practice_sessions to anon;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.practice_sessions to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.practice_sessions to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.profiles to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.profiles to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.program_attendances to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.program_attendances to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.program_attendances to service_role;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.program_class_cancellations to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.program_class_cancellations to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.program_class_cancellations to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.program_enrollments to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.program_enrollments to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.program_enrollments to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.program_exams to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.program_exams to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.program_exams to service_role;
grant SELECT on table public.program_schedule_versions to anon;
grant SELECT on table public.program_schedule_versions to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.program_schedule_versions to service_role;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.program_schedules to anon;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.program_schedules to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.program_schedules to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.program_sessions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.program_sessions to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.program_sessions to service_role;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.programs to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.programs to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.programs to service_role;
grant REFERENCES, TRIGGER, TRUNCATE on table public.user_achievements to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_achievements to authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.user_achievements to service_role;
