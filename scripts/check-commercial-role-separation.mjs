import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Existing roleCapabilities is a UI projection; authorization is enforced in Supabase.
// Membership / Puppy / Comandos are commercial entitlements, not staff privileges.
const source = fs.readFileSync('src/constants/roleCapabilities.ts','utf8');
const script = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
}}).outputText;
const mod = { exports: {} };
vm.runInNewContext(script, { module: mod, exports: mod.exports });
const capabilities = mod.exports.getRoleCapabilities;
assert.equal(typeof capabilities, 'function');

const client = capabilities('client'), member = capabilities('member'),
  trainer = capabilities('trainer'), admin = capabilities('admin'),
  superadmin = capabilities('super_admin');
assert.deepEqual(JSON.parse(JSON.stringify(client)), JSON.parse(JSON.stringify(member)),
  'Membresía Socio no puede crear permisos operativos.');
for(const role of [client, member]) {
 for(const key of ['canManageStaffRoles','canManagePayments','canRecordAttendance',
                   'canManageCustomers','canViewInternalDogNotes','canPublishExamResults'])
   assert.equal(role[key],false,'Cliente/Socio gained staff permission: '+key);
}
for(const key of ['canRecordAttendance','canManageClassRoster','canUploadExamDefinition'])
  assert.equal(trainer[key],true,'Trainer missing scoped operational ability '+key);
for(const key of ['canManagePayments','canManageStaffRoles','canPublishExamResults'])
  assert.equal(trainer[key],false,'Trainer gained excessive privilege '+key);
assert.equal(admin.canManageMemberships,true);
assert.equal(admin.canManageStaffRoles,false);
assert.equal(superadmin.canManageStaffRoles,true);
assert.equal(capabilities(null).canManagePayments,false);
assert.equal(capabilities('comandos').canManagePayments,false,
  'Comandos nunca es rol con permisos administrativos.');
assert.equal(capabilities('puppy').canRecordAttendance,false,
  'Puppy nunca es rol Entrenador.');
console.log('UCAPSA roleCapabilities: commercial rights do not imply staff permissions PASS');
