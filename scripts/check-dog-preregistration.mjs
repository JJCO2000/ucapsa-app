import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync('supabase/migrations/20261018195000_admin_dog_preregistration.sql','utf8');
const service = fs.readFileSync('src/services/dog-preregistration.service.ts','utf8');
const screen = fs.readFileSync('src/app/admin/preregister-dog.tsx','utf8');
const list = fs.readFileSync('src/app/admin/users.tsx','utf8');
const session = fs.readFileSync('src/hooks/useSession.tsx','utf8');
const types = fs.readFileSync('src/types/database.generated.ts','utf8');

for (const condition of [
  'create schema if not exists ucapsa_intake',
  'revoke all on schema ucapsa_intake from public, anon, authenticated',
  'alter table ucapsa_intake.people enable row level security',
  'alter table ucapsa_intake.dogs enable row level security',
  'intake_pending_email_unique',
  'intake_pending_phone_unique',
  'intake_dog_per_person_normalized_unique',
  'references auth.users(id)',
  'on delete restrict',
  'create or replace function public.admin_preregister_dog',
  'create or replace function public.claim_my_preregistered_dogs',
  'public.is_ucapsa_admin()',
  'auth.uid()',
  'email_confirmed_at',
  'phone_confirmed_at',
  'pg_advisory_xact_lock',
  'for update',
  "status='pending'",
  "status='linked'",
  'linked_dog_id',
  'admin_audit_logs',
  'v_count<>1',
  "'conflict'",
  'public.profiles',
  'public.dogs',
  'revoke all on function public.admin_preregister_dog',
  'revoke all on function public.claim_my_preregistered_dogs',
]) assert.ok(sql.includes(condition),'Falta invariante: '+condition);

for (const bad of [
 /insert\s+into\s+auth\.users/i,
 /insert\s+into\s+public\.memberships/i,
 /insert\s+into\s+public\.payments/i,
 /insert\s+into\s+public\.program_enrollments/i,
 /insert\s+into\s+public\.program_attendances/i,
]) assert.ok(!bad.test(sql),'El flujo provisional no debe crear cuentas/pagos/asistencias');

assert.ok(screen.includes('adminPreregisterDog('));
assert.ok(screen.includes('if (!isAdmin) return'));
assert.ok(screen.includes('Guardar preinscripción'));
assert.ok(list.includes("'/admin/preregister-dog'"));
assert.ok(service.includes("supabase.rpc('admin_preregister_dog'"));
assert.ok(service.includes("supabase.rpc('claim_my_preregistered_dogs'"));
assert.ok(session.includes('claimMyPreregisteredDogs()'));
assert.ok(session.includes('isOfflineFallback || usingCachedProfile'));
assert.ok(session.includes('clearClientReadCache(authenticatedUserId)'));
assert.ok(types.includes('admin_preregister_dog:'));
assert.ok(types.includes('claim_my_preregistered_dogs:'));

console.log('UCAPSA preinscripción Admin/Superadmin, Auth verificada, SSOT y anti duplicados: PASS');
