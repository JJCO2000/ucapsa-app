import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rls-overlap-final-cleanup.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  "if v_count <> 18",
  'alter policy "achievement_definitions_select_all"',
  'drop policy "announcements_admin_all"',
  'drop policy "events_admin_all"',
  'alter policy "dogs_owner_insert_enabled"',
  'alter policy "dogs_owner_select_enabled"',
  'alter policy "dogs_owner_update_enabled"',
  'drop policy "dogs_admin_all"',
  'alter policy "dog_documents_owner_insert_enabled"',
  'alter policy "dog_documents_owner_select_enabled"',
  'drop policy "dog_documents_admin_all"',
  'create policy "memberships_insert_own_or_admin"',
  'alter policy "program_exams_owner_insert_enabled"',
  'alter policy "program_exams_owner_select_enabled"',
  'drop policy "program_exams_admin_all"',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error('Final RLS overlap cleanup missing: ' + token);
  }
}

for (const canonical of [
  'achievement_definitions_select_all',
  'announcements_select_by_audience',
  'events_select_by_audience',
  'memberships_select_own_or_admin',
]) {
  const pattern = new RegExp('drop\\s+policy[^;]*"' + canonical + '"', 'i');
  if (pattern.test(sql)) {
    throw new Error('Final RLS cleanup tries to drop canonical read policy: ' + canonical);
  }
}

for (const token of [
  "user_id = (select auth.uid())",
  "uploaded_by = (select auth.uid())",
  "requested_by = (select auth.uid())",
  "public.is_admin()",
]) {
  if (!sql.includes(token)) {
    throw new Error('Final RLS cleanup lost authorization predicate: ' + token);
  }
}

if (!pkg.includes('"check:rls-overlap-final"')) {
  throw new Error('npm verify does not include final RLS overlap guard.');
}

console.log('UCAPSA final RLS overlap cleanup: PASS');
