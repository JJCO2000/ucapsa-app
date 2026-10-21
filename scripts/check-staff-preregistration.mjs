import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminHome = fs.readFileSync('src/app/(tabs)/admin-home.tsx', 'utf8');
const trainerHome = fs.readFileSync('src/app/(tabs)/trainer-home.tsx', 'utf8');
const screen = fs.readFileSync('src/app/staff/preregister-dog.tsx', 'utf8');
const service = fs.readFileSync('src/services/dog-preregistration.service.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261021110000_staff_preregistration_entry.sql', 'utf8');

assert.ok(adminHome.includes("router.push('/admin/preregister-dog' as never)")
  && adminHome.includes('accessibilityLabel="Preinscribir persona y perro"'),
'Admin Inicio must expose existing pre-enrollment screen');
assert.ok(trainerHome.includes("router.push('/staff/preregister-dog' as never)")
  && trainerHome.includes('accessibilityLabel="Preinscribir persona y perro"'),
'Trainer Inicio must expose staff quick entry');

assert.ok(screen.includes("const { isStaff, isAdmin } = useSession()")
  && screen.includes("if (!isStaff || !preregistrationEnabled) return <Redirect")
  && screen.includes("staffPreregisterDogWithProgram({"),
'Quick capture must check the staff role and call guarded RPC');
assert.ok(!screen.includes('setMemberAuthorized')
  && !screen.includes('adminApprovePreregistrationOwnerLink')
  && !screen.includes('getAdminPreregistrationRecords'),
'Trainer cannot approve membership, link owner, or view Admin-only directory');
assert.ok(service.includes("'staff_preregister_dog_with_program'")
  && service.includes('normalizeContactPhone(input.ownerPhone)')
  && !service.includes('SUPABASE_SERVICE_ROLE_KEY'),
'No privileged keys in staff service; server executes the RPC');

const wrapper = migration.split('create or replace function public.staff_preregister_dog_with_program(')[1] ?? '';
assert.ok(wrapper.includes("not public.is_ucapsa_staff()")
  && wrapper.includes("auth.uid() is null")
  && wrapper.includes("raise exception 'La preinscripción ya existe.")
  && wrapper.includes('pg_advisory_xact_lock')
  && wrapper.includes('admin_preregister_dog(')
  && wrapper.includes('admin_save_preregistered_program_history('),
'Staff RPC must enforce role, atomic de-duplication and canonical helpers');
assert.match(wrapper, /null::text,null::date,0,array\[\]::date\[\]/i);
assert.ok(!wrapper.includes('admin_set_preregistered_membership')
  && !wrapper.includes('auth.admin')
  && !wrapper.includes('insert into public.memberships')
  && !wrapper.includes('insert into public.program_enrollments'),
'Staff RPC cannot create memberships, Auth or official records');

for (const signature of [
  'admin_preregister_dog(text,text,text,text)',
  'admin_save_preregistered_program_history(uuid,text,text,text,date,integer,date[],text)',
]) {
  assert.ok(migration.includes('revoke execute on function public.' + signature),
    'Untrusted callers must not directly access broadened helper: ' + signature);
}
assert.equal((migration.match(/\n\$function\$;/g) ?? []).length,2,
'Both existing helper source definitions must remain valid SQL statements.');
assert.ok(migration.includes('grant execute on function public.staff_preregister_dog_with_program(text,text,text,text,text,text) to authenticated'),
'New RPC must be available only to signed-in personnel and perform its own role check.');

console.log('UCAPSA staff quick preregistration: role/navigation/write/SQL contracts PASS');
