import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-account-deletion-verified-admin-completion.sql','utf8');
const screen = fs.readFileSync('src/app/admin/account-deletion-requests.tsx','utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json','utf8'));

function verifyGuard(text) {
  const tokens = [
    'create or replace function public.admin_complete_account_deletion_request',
    'if not public.is_super_admin() then',
    "if v_before.status <> 'blocked' then",
    'if v_before.retention_until is null then',
    'if v_before.retention_until > current_date then',
    'if v_before.user_id is not null then',
    "using errcode = '23514'",
    "status = 'completed'",
    'snapshot_name = null',
    'snapshot_email = null',
    "'completed',",
    'revoke all on function public.admin_complete_account_deletion_request',
    'grant execute on function public.admin_complete_account_deletion_request',
  ];
  for (const token of tokens) assert.ok(text.includes(token),'Missing deletion guard: '+token);
  const body = text.toLowerCase();
  assert.ok(body.indexOf("if v_before.user_id is not null then") < body.indexOf("status = 'completed'"),
    'Auth ownership must be checked before the completed update.');
  assert.doesNotMatch(text,/delete\s+from\s+auth\.users/i,
    'Administrative completion must never silently delete Auth from this RPC.');
}
verifyGuard(sql);
for (const token of ["if v_before.user_id is not null then","snapshot_name = null","if not public.is_super_admin() then"]) {
  assert.throws(() => verifyGuard(sql.replace(token,'')),/Missing deletion guard/,
    'Quality gate must reject a removed essential predicate: '+token);
}
for (const token of [
  "row.user_id === null",
  "row.status === 'blocked'",
  "Boolean(row.retention_until)",
  "row.retention_until! <= todayKey()",
  "completeAccountDeletionRequest",
]) assert.ok(screen.includes(token), 'Superadmin UI no longer guards completion: '+token);
assert.equal(packageJson.scripts['check:account-deletion-verified-completion'],
  'node scripts/check-account-deletion-verified-completion.mjs');
assert.ok(packageJson.scripts.verify.includes('npm run check:account-deletion-verified-completion &&')
  && packageJson.scripts['verify:release'].includes('npm run verify'),
  'New completion guard must run via verify and verify:release.');
console.log('UCAPSA deletion completion verification gate PASS (static source checks, no live Auth deletion)');
