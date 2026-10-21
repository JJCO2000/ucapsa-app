import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

function read(file) { return fs.readFileSync(file, 'utf8'); }
const edge = read('supabase/functions/admin-activate-phone-login/index.ts');
const service = read('src/services/admin-phone-login.service.ts');
const ui = read('src/app/admin/customer-profile-edit.tsx');
const pkg = read('package.json');
for (const [name, code] of [
  ['Edge Function', edge], ['Client service', service], ['Admin UI', ui],
]) {
  const file = name === 'Admin UI' ? 'input.tsx' : 'input.ts';
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  assert.equal(parsed.parseDiagnostics.length, 0, name + ' syntax must parse');
}
assert.ok(edge.includes("operator?.role !== 'super_admin'"), 'Only Superadmin may approve identity');
assert.ok(edge.includes("target.role !== 'client' && target.role !== 'member'"), 'Staff targets forbidden');
assert.ok(edge.includes('confirmedByStaff !== true'), 'Staff must attest to manual contact check');
assert.ok(edge.includes("contacts.some(row => row.user_id !== userId"), 'Duplicate contacts must fail closed');
assert.ok(edge.includes('count > contacts.length'), 'Pagination must fail closed');
assert.ok(edge.includes('auth.admin.updateUserById(userId'), 'Must update existing Auth user via admin API');
assert.ok(edge.includes('phone_confirm: true'), 'Admin approval must set Auth-confirmed phone');
assert.ok(edge.includes("phone_login_activation_requested") && edge.includes("phone_login_activation_completed"), 'Audit request and success');
assert.ok(edge.indexOf("phone_login_activation_requested") < edge.indexOf('auth.admin.updateUserById(userId'), 'Audit first');
assert.ok(!edge.includes('auth.admin.createUser') && !edge.includes('SUPABASE_ANON_KEY'), 'No account creation or anonymous trust');
assert.ok(service.includes("supabase.functions.invoke('admin-activate-phone-login'"), 'Must call server endpoint');
assert.ok(ui.includes("role === 'super_admin'") && ui.includes('staffConfirmedPhone') &&
  ui.includes('sameContactPhone(profile.phone, phone)'), 'Superadmin must confirm stored contact, not unsaved phone');
assert.ok(pkg.includes('"check:admin-phone-login"') &&
  pkg.includes('npm run check:admin-phone-login &&'), 'Guard must be in verification pipeline');

// Exercise the Edge normalizer, and enforce parity with the mobile shared normalizer.
const slice = edge.match(/function canonicalPhone\(raw: string\): string \| null \{[\s\S]*?\n\}/);
assert.ok(slice, 'Pure server phone normalizer should be testable');
const serverJS = ts.transpileModule(slice[0] + '\nexports.canonicalPhone = canonicalPhone;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports1 = {};
vm.runInNewContext(serverJS, { exports: exports1 });
const mobile = { exports: {} };
const mobileJS = ts.transpileModule(read('src/utils/phone-contact.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(mobileJS, { exports: mobile.exports, module: mobile });
for (const value of ['5535100214', '+525535100214', '52 55 35 100 214', '55,3510-0214', '+34911222333']) {
  assert.equal(exports1.canonicalPhone(value), mobile.exports.normalizeContactPhone(value));
}
for (const value of ['', 'abc', '123', '0000000000', '+0012345678']) {
  assert.equal(exports1.canonicalPhone(value), null);
}
console.log('UCAPSA superadmin-assisted phone login: PASS');
