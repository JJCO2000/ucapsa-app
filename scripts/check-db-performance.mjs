import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-db-performance-hardening.sql', 'utf8');
const rlsSql = fs.readFileSync('supabase/sql/ucapsa-rls-select-overlap-cleanup.sql', 'utf8');
const semanticSql = fs.readFileSync('supabase/sql/ucapsa-rls-semantic-merge-cleanup.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  'if v_count <> 35',
  "replace(r.qual, 'auth.uid()', '(select auth.uid())')",
  "replace(r.with_check, 'auth.uid()', '(select auth.uid())')",
  'drop index if exists public.events_calendar_visibility_idx;',
  'drop index if exists public.memberships_qr_token_unique_idx;',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error('DB performance hardening contract missing: ' + token);
  }
}

if (/drop\s+index[^;]*(memberships_qr_token_key|events_visibility_idx)/i.test(sql)) {
  throw new Error('DB performance hardening is trying to remove a canonical/constraint-backed index.');
}

const rlsRequired = [
  'if v_missing <> 0',
  'drop policy if exists "member_visits_admin_all"',
  'drop policy if exists "membership_billing_profiles_admin_all"',
  'drop policy if exists "payment_obligations_admin_all"',
  'drop policy if exists "payments_admin_all"',
  'drop policy if exists "user_achievements_admin_all"',
  'drop policy if exists "program_schedule_versions_admin_write"',
  'drop policy if exists "program_sessions_admin_all"',
  'alter policy "programs_public_calendar_select"',
  'alter policy "program_schedules_public_calendar_select"',
  'to anon;',
];

for (const token of rlsRequired) {
  if (!rlsSql.includes(token)) {
    throw new Error('RLS SELECT-overlap cleanup contract missing: ' + token);
  }
}

if (!rlsSql.includes('do $ucapsa$') || !rlsSql.includes('$ucapsa$;')) {
  throw new Error('RLS cleanup must use the tagged $ucapsa$ DO delimiter.');
}

for (const canonicalReadPolicy of [
  'member_visits_own_select',
  'membership_billing_profiles_select_own_or_admin',
  'payment_obligations_select_own_or_admin',
  'payments_select_own_or_admin',
  'user_achievements_select_own_or_admin',
  'program_schedule_versions_read',
  'program_sessions_authenticated_select',
  'programs_select_active_or_admin',
  'program_schedules_select_active_or_admin',
]) {
  const dropPattern = new RegExp('drop\\s+policy[^;]*"' + canonicalReadPolicy + '"', 'i');
  if (dropPattern.test(rlsSql)) {
    throw new Error('RLS cleanup is trying to drop canonical read policy: ' + canonicalReadPolicy);
  }
}

const semanticRequired = [
  'RLS semantic merge aborted',
  'achievement_definitions_select_authenticated',
  'announcements_select_canonical',
  'dog_documents_select_canonical',
  'dog_documents_insert_canonical',
  'dogs_select_canonical',
  'dogs_insert_canonical',
  'dogs_update_canonical',
  'events_select_canonical',
  'memberships_insert_canonical',
  'program_exams_select_canonical',
  'program_exams_insert_canonical',
];

for (const token of semanticRequired) {
  if (!semanticSql.includes(token)) {
    throw new Error('RLS semantic merge contract missing: ' + token);
  }
}

if (!semanticSql.includes('do $ucapsa$') || !semanticSql.includes('$ucapsa$;')) {
  throw new Error('RLS semantic merge must use the tagged $ucapsa$ DO delimiter.');
}

for (const preservedPolicy of [
  'memberships_select_own_or_admin',
  'memberships_admin_update',
  'memberships_super_admin_delete',
]) {
  const dropPattern = new RegExp('drop\\s+policy[^;]*"' + preservedPolicy + '"', 'i');
  if (dropPattern.test(semanticSql)) {
    throw new Error('RLS semantic merge is trying to drop preserved policy: ' + preservedPolicy);
  }
}

for (const requiredAdminWrite of [
  'achievement_definitions_admin_insert',
  'achievement_definitions_admin_update',
  'achievement_definitions_admin_delete',
  'announcements_admin_insert',
  'announcements_admin_update',
  'announcements_admin_delete',
  'dog_documents_admin_update',
  'dog_documents_admin_delete',
  'dogs_admin_delete',
  'events_admin_insert',
  'events_admin_update',
  'events_admin_delete',
  'program_exams_admin_update',
  'program_exams_admin_delete',
]) {
  if (!semanticSql.includes(requiredAdminWrite)) {
    throw new Error('RLS semantic merge lost admin write path: ' + requiredAdminWrite);
  }
}

if (!pkg.includes('"check:db-performance"')) {
  throw new Error('npm verify does not include the DB performance guard.');
}

console.log('UCAPSA DB performance hardening: PASS');
