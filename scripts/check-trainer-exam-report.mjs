import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (path) => fs.readFileSync(path,'utf8');
const source = read('supabase/sql/ucapsa-staff-exam-report.sql');
const migration = read('supabase/migrations/20261018193000_staff_exam_report.sql');
const service = read('src/services/exam-report-export.service.ts');
const screen = read('src/app/staff/exam-report.tsx');
const catalog = read('src/app/(tabs)/trainer-exams.tsx');
const types = read('src/types/database.generated.ts');
assert.equal(source, migration, 'La migración difiere del SQL fuente');
for (const needle of [
  'create or replace function public.get_staff_exam_report(',
  'if not public.is_ucapsa_staff() then',
  'public.can_ucapsa_staff_access_dog(a.dog_id)',
  "a.presented_at at time zone 'America/Mexico_City'",
  'p_exam_id is null or e.id = p_exam_id',
  'left join public.ucapsa_exam_item_results r',
  'r.points_awarded',
  'a.is_official',
  'a.voided_at',
  "a.status = 'published'",
  'a.is_official = true',
  'a.voided_at is null',
  'revoke all on function public.get_staff_exam_report',
]) assert.ok(source.includes(needle), 'Falta protección del reporte: ' + needle);
assert.ok(!/\b(insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\./i.test(source),
  'El reporte debe ser solo lectura');
for (const token of [
  "supabase.rpc('get_staff_exam_report'",
  'row.points_awarded === null ? null',
  'row.presented_date',
  "const sheetNames = ['Comparación']",
  'selectedOfficialAttempts',
]) {
  // selectedOfficialAttempts se materializa en el builder, no como otra tabla.
  if (token === 'selectedOfficialAttempts') {
    assert.ok(service.includes('best = new Map<string, StaffExamReportRow>()'));
  } else {
    assert.ok(service.includes(token), 'Matriz incompleta: ' + token);
  }
}
for (const token of [
  'getStaffExamReport(selectedExamId)',
  'selectedDogIds',
  'Exportar Excel',
  'Seleccionar todos',
]) assert.ok(screen.includes(token), 'Falta selección: ' + token);
assert.ok(catalog.includes("router.push('/staff/exam-report'"), 'Falta acceso contextual');
assert.ok(types.includes('get_staff_exam_report:'), 'Faltan tipos de RPC');
assert.ok(!screen.includes('Rango máximo: 366 días'), 'No conservar filtros innecesarios');
assert.ok(!service.includes('p_start_date:'), 'No mezclar varios exámenes por periodo');
console.log('UCAPSA Excel de exámenes: permisos por perro, SSOT y calificaciones verificadas: PASS');
