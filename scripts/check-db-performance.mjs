import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-db-performance-hardening.sql', 'utf8');
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

if (!pkg.includes('"check:db-performance"')) {
  throw new Error('npm verify does not include the DB performance guard.');
}

console.log('UCAPSA DB performance hardening: PASS');
