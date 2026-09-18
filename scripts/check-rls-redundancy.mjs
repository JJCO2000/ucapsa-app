import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rls-redundancy-cleanup.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  'drop policy if exists "program_class_cancellations_public_calendar_select"',
  'drop policy if exists "payments_admin_delete"',
  'drop policy if exists "memberships_admin_select"',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error('RLS redundancy cleanup missing: ' + token);
  }
}

for (const forbidden of [
  'program_class_cancellations_public_select',
  'payments_admin_all',
  'memberships_select_own_or_admin',
]) {
  const pattern = new RegExp('drop\\s+policy[^;]*' + forbidden, 'i');
  if (pattern.test(sql)) {
    throw new Error('RLS cleanup is trying to drop a canonical policy: ' + forbidden);
  }
}

if (!pkg.includes('"check:rls-redundancy"')) {
  throw new Error('npm verify does not include the RLS redundancy guard.');
}

console.log('UCAPSA RLS proven-redundancy cleanup: PASS');
