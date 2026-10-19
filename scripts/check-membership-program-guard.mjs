import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261019062000_guard_member_program_enrollments.sql','utf8');
for(const key of [
  "OLD.status = 'active'",
  'NEW.status IS DISTINCT FROM OLD.status',
  "e.status = 'active'",
  "e.access_mode = 'membership'",
  'e.membership_id = OLD.id',
  'BEFORE UPDATE OF status ON public.memberships',
  "ERRCODE = '23514'",
]) assert.ok(sql.includes(key),'Missing membership/program protection invariant: '+key);
assert.ok(!/update\\s+public\\.program_enrollments/i.test(sql),
  'Status guard must not rewrite training enrollments');
const ci=fs.readFileSync('.github/workflows/ucapsa-membership-program-guard.yml','utf8');
assert.ok(ci.includes('membership-program-guard-e2e.sql'));
assert.ok(ci.includes('postgres:16.4-alpine'));
console.log('UCAPSA commercial cancellation program safety guard: PASS');
