import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const read = path => fs.readFileSync(path,'utf8');
const ui = read('src/app/admin/users.tsx');
const service = read('src/services/profiles.service.ts');
const membership = read('src/app/admin/customer-membership.tsx');
const capabilities = read('src/constants/roleCapabilities.ts');
const sql = read('supabase/migrations/20261019040000_preserve_staff_role_during_membership_lifecycle.sql');
const parsed = ts.createSourceFile('users.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(x=>x.messageText).join(';'));

assert.ok(ui.includes("profile.role !== 'super_admin';"),'Only Superadmin is protected from the selector');
assert.ok(!ui.includes("profile.role !== 'member';"),'Socio must not block Trainer or Admin role');
assert.ok(!ui.includes('Para staff usa una cuenta separada'),'Do not duplicate identity for member and staff');
assert.ok(ui.includes('getAdminActiveMembershipUserIds()'),'Commercial membership uses official membership data');
assert.ok(ui.includes('Gestionar membresía de Socio por separado'),'Commercial condition needs its own screen');
assert.ok(ui.includes("'/admin/customer-membership?userId='"),'Deep link to official membership editor');
assert.ok(ui.includes("profile.role === 'super_admin'"),'Protect Superadmin');
for (const token of ["{ value: 'client', label: 'Cliente' }","{ value: 'trainer', label: 'Entrenador' }","{ value: 'admin', label: 'Admin' }"]) {
  assert.ok(ui.includes(token),'Missing operational role '+token);
}
assert.ok(!ui.includes("value: 'member', label: 'Socio'"),'Socio is not an operational permission');
assert.ok(service.includes("supabase.rpc('superadmin_set_profile_role'"),'Use role-authorized server RPC');
assert.ok(!service.includes("from('memberships').update("),'Role change must not mutate memberships');
assert.ok(membership.includes('forceMembershipForProfile('),'Socio is granted in membership workflow');
assert.ok(capabilities.includes("if (role === 'trainer') return TRAINER;"),'Real role remains source of operational capabilities');
assert.ok(sql.includes("p.role not in ('trainer', 'admin', 'super_admin')"),'Membership trigger must preserve staff role');
console.log('UCAPSA separate Superadmin role vs Socio membership: PASS');
