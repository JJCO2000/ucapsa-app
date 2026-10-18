import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261018170000_staff_summary_include_empty_sessions.sql');
const sqlSource = read('supabase/sql/ucapsa-trainer-workspace.sql');
const home = read('src/app/(tabs)/trainer-home.tsx');
const roster = read('src/app/(tabs)/trainer-classes.tsx');
const service = read('src/services/trainer-staff.service.ts');

for (const token of [
  'from public.program_schedules s',
  'join lateral public.get_effective_program_schedule(s.id, p_class_date)',
  'effective.is_active = true',
  'effective.repeat_type',
  'effective.cycle_start_date',
  'program_class_cancellations',
  'c.restored_at is null',
  'left join eligible x on x.schedule_id = s.schedule_id',
  'count(x.enrollment_id)::integer',
  "where e.status = 'active'",
  'if not public.is_ucapsa_staff() then',
]) {
  assert.ok(sql.includes(token), 'Falta regla del horario oficial: ' + token);
}
assert.ok(!/count\(\*\)::integer/.test(sql),
  'Los horarios vacíos no pueden contarse como alumnos');
assert.ok(sqlSource.includes('left join eligible x on x.schedule_id = s.schedule_id'),
  'El SQL fuente no concuerda con la migración');
assert.ok(home.includes('localDateKey()') && home.includes('tomorrowKey()'));
assert.ok(home.includes('Promise.allSettled(['),
  'Los fallos por día deben ser independientes');
assert.ok(home.includes("'Clases de hoy'") && home.includes("'Quién esperamos'"));
assert.ok(home.includes("getStaffClassSummary(todayKey)"));
assert.ok(home.includes("getStaffClassSummary(dateKey)"));
assert.ok(roster.includes('getStaffClassSummary(dateKey)'));
assert.ok(roster.includes('getStaffClassRoster(dateKey)'));
assert.ok(roster.includes('groupRoster(rows, officialSchedules)'));
assert.ok(roster.includes("setError('No pudimos verificar los horarios oficiales."),
  'No se debe mostrar un roster falso si falla el catálogo oficial');
assert.ok(roster.includes('Sin alumnos inscritos en este horario.'));
assert.ok(roster.includes('getStaffIntroAgendaPlans(dateKey)'),
  'Las visitas iniciales no forman parte de las inscripciones oficiales');
assert.ok(service.includes("supabase.rpc('get_staff_class_rsvp_summary'"));
console.log('UCAPSA horarios oficiales, 0 inscritos, hoy/mañana, SSOT y fallos parciales: PASS');
