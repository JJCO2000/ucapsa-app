import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-account-deletion-workflow.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  'create table if not exists public.account_deletion_requests',
  "status in ('pending', 'in_review', 'blocked', 'rejected', 'completed')",
  'account_deletion_one_open_request_per_user_idx',
  'create or replace function public.request_my_account_deletion',
  'create or replace function public.admin_update_account_deletion_request',
  "p_status = 'blocked' and p_retention_until is null",
  "p_status = 'completed'",
  'revoke all on function public.request_my_account_deletion(text)',
  'revoke all on function public.admin_update_account_deletion_request(uuid, text, text, date)',
];

for (const token of required) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Account deletion workflow contract missing: ' + token);
  }
}

if (/delete\s+from\s+auth\.users|delete\s+from\s+public\.(profiles|dogs|payments|memberships)/i.test(sql)) {
  throw new Error('Account deletion foundation must not perform destructive deletion before retention is resolved.');
}

if (!pkg.includes('"check:account-deletion"')) {
  throw new Error('npm verify does not include the account deletion workflow guard.');
}

console.log('UCAPSA account deletion workflow foundation: PASS');
