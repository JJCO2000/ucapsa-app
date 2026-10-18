import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261018160000_superadmin_member_role_ssot.sql');
const ui = read('src/app/admin/users.tsx');
const service = read('src/services/profiles.service.ts');
const source = sql.split('create or replace function public.superadmin_set_profile_role(')[1]?.split('revoke all on function public.superadmin_set_profile_role')[0] ?? '';

assert.ok(source, 'Falta RPC única para cambios de Superadmin');
assert.ok(source.includes("v_role not in ('client', 'member', 'trainer', 'admin')"));
assert.ok(source.includes("v_actor_role <> 'super_admin'"));
assert.ok(source.includes("v_before_role = 'super_admin'"));
assert.ok(source.includes('for update;'));
assert.ok(source.includes('on conflict (user_id) do update'));
assert.ok(source.includes("'active'::public.membership_status"));
assert.ok(source.includes('where m.status is distinct from'));
assert.ok(source.includes("v_before_membership_status = 'active'"));
assert.ok(source.includes('public.admin_audit_logs'));
for (const forbidden of [
  /insert\s+into\s+public\.payments/i,
  /update\s+public\.payments/i,
  /insert\s+into\s+public\.payment_obligations/i,
  /insert\s+into\s+public\.program_attendances/i,
]) {
  assert.ok(!forbidden.test(source), 'La conversión de rol no puede fabricar hechos comerciales');
}
assert.ok(sql.includes("p.role not in ('trainer', 'admin', 'super_admin')"));
assert.ok(ui.includes("{ value: 'member', label: 'Socio' }"));
assert.ok(ui.includes('setStaffRoleSuperAdmin'));
assert.ok(!ui.includes('Una cuenta de socio conserva su rol de cliente'));
assert.ok(service.includes("role: Extract<AppRole, 'client' | 'member' | 'trainer' | 'admin'>"));
assert.ok(service.includes("supabase.rpc('superadmin_set_profile_role'"));
console.log('UCAPSA rol Socio atómico, SSOT y UI no saturada: PASS');
