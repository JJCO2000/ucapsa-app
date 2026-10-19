import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Focused regression: staff membership is commercial. This mock does not
// replace live RLS or trigger verification; PostgreSQL remains the authority.
const memberships = [];
const profiles = [
  { user_id: 'staff-admin', role: 'admin' },
  { user_id: 'staff-super', role: 'super_admin' },
  { user_id: 'staff-trainer', role: 'trainer' },
  { user_id: 'client-user', role: 'client' },
];
const payments = [{ id: 'historic-payment', user_id: 'staff-trainer', amount: 125 }];
const enrollments = [];
const profileBefore = JSON.stringify(profiles);
const paymentBefore = JSON.stringify(payments);
const writes = [];
let serial = 0;

class Query {
  constructor(table) {
    assert.equal(table, 'memberships', 'Commercial service accessed another table');
    this.table = table;
    this.op = 'select';
    this.filters = [];
    this.payload = null;
  }
  select() { return this; }
  eq(key, val) { this.filters.push([key, val]); return this; }
  order() { return this; }
  limit() { return this; }
  insert(row) { this.op = 'insert'; this.payload = { ...row }; return this; }
  update(row) { this.op = 'update'; this.payload = { ...row }; return this; }
  maybeSingle() { return Promise.resolve(this.execute()); }
  single() { return Promise.resolve(this.execute()); }
  then(fulfilled, rejected) { return Promise.resolve(this.execute()).then(fulfilled, rejected); }
  execute() {
    const matches = memberships.filter(row =>
      this.filters.every(([k, v]) => row[k] === v));
    if (this.op === 'select') return { data: matches[0] ?? null, error: null };
    if (this.op === 'insert') {
      if (memberships.some(row => row.user_id === this.payload.user_id))
        return { data: null, error: new Error('duplicate membership') };
      const row = { id: 'membership-' + (++serial), current_payment_status: 'pending', ...this.payload };
      memberships.push(row);
      writes.push({ table: this.table, type: this.op, id: row.id });
      return { data: row, error: null };
    }
    if (this.op === 'update') {
      const row = matches[0];
      if (!row) return { data: null, error: new Error('not found') };
      if (this.payload.status === 'cancelled' && enrollments.some(e =>
          e.membership_id === row.id && e.status === 'active' && e.access_mode === 'membership')) {
        return { data: null, error: new Error('23514 active class guard') };
      }
      Object.assign(row, this.payload);
      writes.push({ table: this.table, type: this.op, id: row.id });
      return { data: row, error: null };
    }
    throw new Error('Unexpected database operation');
  }
}
const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'authorized-superadmin' } }, error: null }) },
  from: table => new Query(table),
};
const transpiled = ts.transpileModule(
  fs.readFileSync('src/services/memberships-admin.service.ts','utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const mod = { exports: {} };
vm.runInNewContext(transpiled, {
  module: mod, exports: mod.exports, require: path => {
    if (path === '../lib/supabase') return { supabase };
    throw new Error('Unexpected runtime dependency: ' + path);
  }, Date, Error, console,
});
const { forceMembershipForProfile, deactivateMembershipForProfile } = mod.exports;

for (const staff of profiles.slice(0,2)) {
  const result = await forceMembershipForProfile(staff);
  assert.equal(result.user_id, staff.user_id);
  assert.equal(result.status, 'active');
  assert.equal(result.approved_by, 'authorized-superadmin');
  assert.equal(result.current_payment_status, 'pending',
    'Do not invent a paid membership');
  const again = await forceMembershipForProfile(staff);
  assert.equal(again.id, result.id, 'Retry must not create duplicate memberships');
  assert.equal(memberships.filter(m => m.user_id === staff.user_id).length, 1);
}
memberships.push({
  id: 'historic-trainer-membership',
  user_id: 'staff-trainer',
  member_number: 'SOC-TRAINER-HISTORY',
  status: 'cancelled',
  current_payment_status: 'paid',
  last_payment_at: '2026-04-02T12:00:00Z',
});
const restored = await forceMembershipForProfile(profiles[2]);
assert.equal(restored.status, 'active');
assert.equal(restored.member_number, 'SOC-TRAINER-HISTORY');
assert.equal(restored.current_payment_status, 'paid');
assert.equal(restored.last_payment_at, '2026-04-02T12:00:00Z');

await deactivateMembershipForProfile(profiles[1]);
assert.equal(memberships.find(m => m.user_id === 'staff-super').status, 'cancelled');
assert.equal(profiles[1].role, 'super_admin');

enrollments.push({membership_id:'historic-trainer-membership',access_mode:'membership',status:'active'});
await assert.rejects(
  deactivateMembershipForProfile(profiles[2]),
  /23514 active class guard/,
  'Simulated database guard must prevent cancellation of linked training'
);
assert.equal(restored.status, 'active');
assert.equal(enrollments[0].status, 'active');
assert.ok(writes.every(x => x.table === 'memberships'));
assert.equal(JSON.stringify(profiles), profileBefore, 'Staff role changed');
assert.equal(JSON.stringify(payments), paymentBefore, 'Historical payments changed');
console.log('UCAPSA Staff + Socio: create, retry, restore, cancel, class guard, history PASS');
