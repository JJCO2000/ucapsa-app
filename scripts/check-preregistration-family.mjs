import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const migration = fs.readFileSync('supabase/migrations/20261023040000_preregistration_family_capture.sql', 'utf8');
const contactMigration = fs.readFileSync('supabase/migrations/20261023053000_require_family_contact.sql', 'utf8');
const afterLinkMigration = fs.readFileSync('supabase/migrations/20261023113000_family_capture_after_link.sql', 'utf8');
const linkedTest = fs.readFileSync('scripts/isolated-db/ucapsa-family-after-link-e2e.sql', 'utf8');

assert.ok(contactMigration.includes('intake_family_contact_required')
  && contactMigration.includes('v_email IS NULL AND v_phone IS NULL')
  && contactMigration.includes('auth.uid()'), 'Family identity requires contact on server.');
const service = fs.readFileSync('src/services/dog-preregistration.service.ts', 'utf8');
const familyService = fs.readFileSync('src/services/preregistration-family.service.ts', 'utf8');
const editor = fs.readFileSync('src/components/domain/PreregistrationFamilyEditor.tsx', 'utf8');
assert.ok(afterLinkMigration.includes("v_status NOT IN ('pending', 'linked')")
  && afterLinkMigration.includes("v_linked_user_id IS NULL")
  && afterLinkMigration.includes("ucapsa_intake.append_family_for_dog")
  && !afterLinkMigration.includes("GRANT EXECUTE"),
  'Allow only valid linked or pending titular records; do not grant new privileges.');
assert.ok(linkedTest.includes("Client added relative without Admin permission")
  && linkedTest.includes("Adding family created an account")
  && linkedTest.includes("Adding family created duplicate titular")
  && linkedTest.includes("Duplicate was not ignored"),
  'Test linked-user addition, permissions and no-duplicate guarantees.');

const admin = fs.readFileSync('src/app/admin/preregister-dog.tsx', 'utf8');
const adminDetail = fs.readFileSync('src/app/admin/preregistration.tsx', 'utf8');
assert.ok(adminDetail.includes("record.status !== 'pending' && record.status !== 'linked'")
  && adminDetail.includes("record.status === 'pending' || record.status === 'linked'"),
  'Admin detail must allow family entry after titular links account.');

const trainer = fs.readFileSync('src/app/staff/preregister-dog.tsx', 'utf8');
const detail = fs.readFileSync('src/app/admin/preregistration.tsx', 'utf8');

for (const token of [
  'create table if not exists ucapsa_intake.family_members',
  'alter table ucapsa_intake.family_members enable row level security',
  'revoke all on ucapsa_intake.family_members from public, anon, authenticated',
  'references ucapsa_intake.people(id)',
  'create unique index if not exists intake_family_person_member_unique',
  'create or replace function public.admin_preregister_dog_with_family',
  'create or replace function public.staff_preregister_dog_with_family',
  'create or replace function public.admin_get_preregistered_family_members',
  'create or replace function public.admin_add_preregistered_family_members',
  'create or replace function ucapsa_intake.append_family_for_dog',
  'auth.uid() is null or not public.is_ucapsa_admin()',
  'auth.uid() is null or not public.is_ucapsa_staff()',
  'v_status <> \'pending\'',
  'grant execute on function public.staff_preregister_dog_with_family',
  'p_family_members jsonb',
]) assert.ok(migration.includes(token), 'Missing security/data contract: ' + token);

assert.ok(migration.includes('public.admin_preregister_dog_with_membership(')
  && migration.includes('public.staff_preregister_dog_with_program('),
  'Family capture must reuse canonical enrollment validation.');
assert.ok(!/insert into (public\.)?(memberships|payments|payment_obligations|program_enrollments|program_attendances|profiles)/i.test(migration),
  'Family must not create official data or payments.');
for (const token of ['claim_my_first_preregistered_dogs','claim_my_preregistered_dogs']) {
  assert.ok(!migration.includes('create or replace function public.' + token),
    'Do not modify canonical account claims.');
}
assert.ok(service.includes('normalizeFamilyMembers(input.familyMembers ?? [])')
  && service.includes("'admin_preregister_dog_with_family'")
  && service.includes("'staff_preregister_dog_with_family'")
  && service.includes("'staff_preregister_dog_with_program'"),
  'Old and new role-specific preregistration paths must remain available.');
assert.ok(editor.includes('Añadir integrante') && editor.includes('Guardar integrante')
  && editor.includes('onChange([...value,') && editor.includes('remove(index)')
  && editor.includes('Celular (correo o celular obligatorio)')
  && editor.includes('Correo (correo o celular obligatorio)'),
  'Family UI needs repeatable editable cards, without mandatory contact.');
assert.ok(editor.includes('if (value.length === 0)')
  && editor.includes('setEditingIndex(null)')
  && editor.includes('editingIndex !== null && value[editingIndex]'),
  'New registration must not inherit a stale unsaved family editor.');
assert.ok(admin.includes('PreregistrationFamilyEditor value={familyMembers}')
  && admin.includes('memberAuthorized, familyMembers,'),
  'Admin capture must persist family members through the canonical service.');
assert.ok(trainer.includes('PreregistrationFamilyEditor value={familyMembers}')
  && trainer.includes('familyMembers,') && !trainer.includes('adminSetPreregisteredMembership'),
  'Trainer capture must offer family without membership privileges.');
assert.ok(detail.includes('getAdminPreregisteredFamily(recordId)')
  && detail.includes('addAdminPreregisteredFamily(record.intakeProgramId')
  && detail.includes('Familia del titular'),
  'Admin record must display persisted family and support appending new members.');

const mockPhone = (phone) => {
  const digits = phone.replace(/\D/g,'');
  if (digits.length === 10) return '+52' + digits;
  if (phone.startsWith('+') && digits.length >= 9 && digits.length <= 15) return '+' + digits;
  throw new Error('Celular inválido');
};
const moduleRef = { exports: {} };
const transpiled = ts.transpileModule(familyService,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(transpiled, {
  exports: moduleRef.exports,
  module: moduleRef,
  require: (path) => {
    if (path === '../utils/phone-contact') return { normalizeContactPhone: mockPhone };
    if (path === '../lib/supabase') return { supabase: {} };
    if (path === './preregistration-privacy-coverage.service') return {
      assertIntakePublishedNotice: async () => 'mock-reviewed-notice-id',
    };
    throw new Error('Unrecognized import ' + path);
  },
  Set,
  Error,
});
const normalize = moduleRef.exports.normalizeFamilyMembers;
assert.deepEqual(JSON.parse(JSON.stringify(normalize([{fullName:'  María Pérez  ', email:' MARIA@EXAMPLE.COM ', phone:'5535100214'}]))),
  [{full_name:'María Pérez',email:'maria@example.com',phone:'+525535100214'}]);
assert.deepEqual(JSON.parse(JSON.stringify(normalize([{fullName:'Ana Ruiz',email:'ana@ejemplo.mx',phone:''}]))),
  [{full_name:'Ana Ruiz',email:'ana@ejemplo.mx',phone:''}]);
assert.throws(() => normalize([{fullName:'Ana Ruiz',email:'',phone:''}]), /correo o celular/i);
assert.throws(() => normalize([{fullName:'',email:'',phone:''}]));
assert.throws(() => normalize([{fullName:'Ana Ruiz',email:'bad',phone:''}]));
assert.throws(() => normalize([{fullName:'Ana Ruiz',email:'',phone:'123'}]));
assert.throws(() => normalize([
  {fullName:'Ana Ruiz',email:'',phone:''},
  {fullName:' Ana Ruiz ',email:'',phone:''},
]));
console.log('UCAPSA family preregistration: roles, SSOT, capture, validation, detail and DB contract PASS');
