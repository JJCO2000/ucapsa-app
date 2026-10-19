import fs from 'node:fs';
import assert from 'node:assert/strict';

// UCAPSA: arquitectura→ficha→acción; UI simple; BD como única verdad.
const read = (path) => fs.readFileSync(path, 'utf8');
const s1 = read('supabase/migrations/20261018195000_admin_dog_preregistration.sql');
const s2 = read('supabase/migrations/20261018210000_staged_program_attendance_evidence.sql');
const s3 = read('supabase/migrations/20261018220000_link_preregistered_history.sql');
const service = read('src/services/dog-preregistration.service.ts');
const screen = read('src/app/admin/preregister-dog.tsx');
const adminAttendance = read('src/app/admin/customer-attendance.tsx');
const adminClient = read('src/app/admin/customer.tsx');
const clientSummary = read('src/services/customer-value.service.ts');
const list = read('src/app/admin/users.tsx');
const session = read('src/hooks/useSession.tsx');
const home = read('src/screens/home/HomeExperienceScreen.tsx');
const types = read('src/types/database.generated.ts');

assert.equal((s1.match(/create table if not exists ucapsa_intake\.people/g)||[]).length,1,
 'La migración original estaba duplicada; debe mantenerse reparada');
assert.equal((s1.match(/create or replace function public.claim_my_preregistered_dogs\(/g)||[]).length,1,
 'Un único RPC base, sin duplicados SQL');
assert.equal((s3.match(/create or replace function public.claim_my_preregistered_dogs\(/g)||[]).length,1,
 'El RPC que enlaza programa solo se define después del esquema histórico');
assert.ok(!s1.includes('ucapsa_intake.programs%rowtype'),
 'La migración inicial no puede depender de tablas futuras');

for (const token of [
  'create schema if not exists ucapsa_intake',
  'revoke all on schema ucapsa_intake from public, anon, authenticated',
  'alter table ucapsa_intake.people enable row level security',
  'alter table ucapsa_intake.dogs enable row level security',
  'intake_pending_email_unique',
  'intake_pending_phone_unique',
  'intake_dog_per_person_normalized_unique',
  'public.is_ucapsa_admin()',
  'auth.uid()',
  'email_confirmed_at',
  'phone_confirmed_at',
  'pg_advisory_xact_lock',
  "status='pending'",
  "status='linked'",
  'linked_dog_id',
  'admin_audit_logs',
  'v_count<>1',
]) assert.ok(s1.includes(token), 'Falta invariante de identidad: '+token);

for (const token of [
  'create table if not exists ucapsa_intake.programs',
  'create table if not exists ucapsa_intake.attendance_evidence',
  "evidence_kind='dated'",
  "evidence_kind='undated_balance'",
  'attendance_date is null',
  'attendance_date is not null',
  'prereg_card_number_unique',
  'intake_history_one_date',
  'intake_history_one_undated_balance',
  'authorized_on date not null default',
  'p_total_attendances-v_unique_count',
  'p_known_dates date[]',
  'v_unique_count>p_total_attendances',
  "v_program.code='comandos' and (v_card is not null or p_card_started_on is not null)",
  "v_program.code='comandos'",
  'admin_preregister_dog_with_program',
  'public.admin_preregister_dog(',
  'public.admin_save_preregistered_program_history(',
  'admin_audit_logs',
  'alter table ucapsa_intake.programs enable row level security',
  'alter table ucapsa_intake.attendance_evidence enable row level security',
]) assert.ok(s2.includes(token), 'Falta control de evidencia provisional: '+token);
assert.ok(s2.includes("quantity,recorded_by,source_note"),
 'Cada evento registra responsable y procedencia');

for (const token of [
  'program_attendance_historical_evidence',
  'intake_evidence_id uuid not null unique',
  'intake_program_id uuid unique',
  'alter table public.program_enrollments',
  "new.intake_program_id is not null and new.started_at is null",
  'historical_evidence_one_date',
  'historical_evidence_one_balance',
  'pg_advisory_xact_lock',
  'trg_guard_historical_date_duplicate',
  'trg_guard_attendance_history_duplicate',
  'union all',
  'sum(a.qty)',
  'then requirements_met_at',
  'perform public.refresh_program_enrollment_progress(v_enrollment_id)',
  "v_stage.physical_card_number,v_stage.program_level",
  'linked_enrollment_id=v_enrollment_id',
  'admin_get_program_historical_evidence',
  'public.is_ucapsa_admin()',
]) assert.ok(s3.includes(token), 'Falta integridad histórica al vincular: '+token);

for (const sql of [s1,s2,s3]) {
  assert.ok(!/insert\s+into\s+(?:auth\.users|public\.payments|public\.payment_obligations)/i.test(sql),
    'Prohibido inventar credenciales o movimientos financieros');
}
assert.ok(!s2.includes('attendance_date := current_date'),
 'Nunca inventar fechas para un saldo desconocido');
assert.ok(s3.includes("new.card_expires_on := null;"),
 'Inicio de tarjeta desconocido no puede renovarse silenciosamente');

assert.ok(screen.includes("programCode === 'puppy' ? 'base' : level"));
assert.ok(screen.includes('adminPreregisterDogWithProgram({'));
assert.ok(screen.includes('knownAttendanceDates: dates'));
assert.ok(screen.includes('Asistencias históricas totales'));
assert.ok(screen.includes('Conozco algunas o todas las fechas'));
assert.ok(screen.includes('Referencia de tarjeta Puppy (si se conoce)'));
assert.ok(screen.includes("programCode === 'puppy' ? cardNumber : ''"));
assert.ok(!screen.includes('obligatoria, ya pagada'));
assert.ok(s2.includes("if v_program.code='puppy' and v_level<>'base'"));
assert.ok(!s2.includes('card_paid_attested_by'));
const staffSql = read('supabase/migrations/20261018230000_staff_preregistered_roster.sql');
assert.ok(staffSql.includes('p_attendance_date < v_program.authorized_on'));
assert.ok(!staffSql.includes('v_program.physical_card_number is null'));
assert.ok(!staffSql.includes('v_program.card_started_on is null or'));
assert.ok(!s2.includes("v_card is null) then"));
assert.ok(screen.includes('Administración autoriza la inscripción.'));
assert.ok(list.includes("'/admin/preregister-dog'"));
assert.ok(service.includes("supabase.rpc('admin_preregister_dog_with_program'"));
assert.ok(service.includes("supabase.rpc('claim_my_preregistered_dogs'"));
assert.ok(session.includes('claimMyPreregisteredDogs()'));
assert.ok(session.includes('setPreregistrationSyncVersion((version) => version + 1)'));
assert.ok(home.includes('[load, preregistrationSyncVersion]'));
assert.ok(home.includes('[isStaff, user, preregistrationSyncVersion]'));
assert.ok(s1.includes('lower(btrim(v_person.owner_name)) <> lower(v_owner)'));
assert.ok(s1.includes('select 1 from auth.users u where'));

assert.ok(session.includes('isOfflineFallback || usingCachedProfile'));
assert.ok(clientSummary.includes('item.enrollment.attendances_count'));
assert.ok(adminClient.includes('recognizedAttendances'));
assert.ok(adminAttendance.includes('getAdminProgramHistoricalEvidence('));
assert.ok(adminAttendance.includes('sin fecha'));
for(const token of [
  'admin_preregister_dog_with_program:',
  'admin_get_program_historical_evidence:',
  'claim_my_preregistered_dogs:',
]) assert.ok(types.includes(token),'Falta RPC tipado: '+token);

// Contrato de ejemplo: total = fechas reales + saldo sin fecha.
const split = (total, dates) => {
  const unique = new Set(dates);
  if (dates.length !== unique.size || dates.length>total || total<0) throw Error('conflicto');
  return {dated:dates.length,undated:total-dates.length};
};
assert.deepEqual(split(2,[]),{dated:0,undated:2});
assert.deepEqual(split(3,['2026-10-04','2026-10-11']),{dated:2,undated:1});
assert.deepEqual(split(2,['2026-10-04','2026-10-11']),{dated:2,undated:0});
assert.throws(()=>split(1,['2026-10-04','2026-10-11']),/conflicto/);
assert.throws(()=>split(2,['2026-10-04','2026-10-04']),/conflicto/);
console.log('UCAPSA preinscripción, Puppy/Comandos, dos fuentes de asistencia, SSOT, anti-duplicados: PASS');
