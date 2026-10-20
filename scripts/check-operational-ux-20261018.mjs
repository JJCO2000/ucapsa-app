import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';

const sources = {
  home: fs.readFileSync('src/screens/home/HomeExperienceScreen.tsx','utf8'),
  trainer: fs.readFileSync('src/app/(tabs)/trainer-home.tsx','utf8'),
  admin: fs.readFileSync('src/app/(tabs)/admin-home.tsx','utf8'),
  customer: fs.readFileSync('src/services/customer-value.service.ts','utf8'),
};
for (const [name, source] of Object.entries(sources)) {
  const parsed = ts.createSourceFile(name.endsWith('customer') ? 'test.ts' : 'test.tsx',
    source, ts.ScriptTarget.ES2022, true, name==='customer'
      ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length,0,
    name+': '+parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
}
assert.equal((sources.home.match(/accessibilityLabel="Consultar menú del restaurante UCAPSA"/g)||[]).length,1,
  'Restaurante debe tener un único acceso en el encabezado');
assert.ok(sources.home.includes("router.push('/restaurant' as never)"),
  'Acceso independiente de membresía');
assert.equal((sources.home.match(/onPress=\{\(\) => router\.push\('\/restaurant' as never\)\}/g)||[]).length,1,
  'Evitar botones de restaurante duplicados');
assert.ok(sources.trainer.includes("label: 'HOY' | 'MAÑANA'"));
assert.ok(sources.trainer.includes('getStaffClassSummary(today)') &&
  sources.trainer.includes('getStaffClassSummary(tomorrow)'));
assert.ok(sources.trainer.includes('isProgramScheduleActiveOnDate(schedule, dateKey)'),
  'No mostrar clases fuera del horario/ciclo');
assert.ok(sources.trainer.includes('cancellation_date === dateKey'),
  'Respetar cancelaciones al listar horarios');
assert.ok(sources.trainer.includes('getProgramSchedules(today)') &&
  sources.trainer.includes('getProgramSchedules(tomorrow)'),
  'Incluir horarios oficiales sin inscritos');
assert.ok(sources.trainer.includes("['Básico','Intermedio','Avanzado']"),
  'Los tres niveles de Comandos permanecen en un horario');
assert.ok(sources.customer.includes("source: 'obligation'"),
  'Las deudas documentadas deben continuar visibles');
assert.ok(!sources.customer.includes('if (snapshot.whatIsNext.legacyMembershipPaymentPending)'),
  'No generar falsa alerta por membresía otorgada');
// Run the real Admin grouping with synthetic data: no database mutation.
function loadPureFunctions(code, globals = {}) {
  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports, Map, Set, Date, ...globals });
  return mod.exports;
}
const domain = loadPureFunctions(fs.readFileSync('src/services/programs.domain.ts', 'utf8'));
const start = sources.admin.indexOf('function commandsLevelLabel(');
const end = sources.admin.indexOf('\nconst emptyStats:', start);
assert.ok(start >= 0 && end > start, 'Admin tomorrow grouping function missing');
const grouping = loadPureFunctions(
  sources.admin.slice(start, end) + '\nexports.groupTomorrowClasses = groupTomorrowClasses;\n',
  { isProgramScheduleActiveOnDate: domain.isProgramScheduleActiveOnDate },
).groupTomorrowClasses;

const day = '2026-10-25'; // Sunday
const programs = [
  { id: 'puppy', code: 'puppy', name: 'Puppy', is_active: true },
  { id: 'comandos', code: 'comandos', name: 'Comandos', is_active: true },
];
const schedule = (id, program_id, start_time, extra = {}) => ({
  id, program_id, name: id, start_time, day_of_week: 0,
  is_active: true, repeat_type: 'weekly', ...extra,
});
const schedules = [
  schedule('empty', 'puppy', '12:30:00'),
  schedule('shared', 'comandos', '11:30:00'),
  schedule('cancelled', 'puppy', '13:30:00'),
  schedule('inactive', 'puppy', '14:30:00', { is_active: false }),
  schedule('offcycle', 'puppy', '15:30:00', {
    repeat_type: 'biweekly', cycle_start_date: '2026-10-18',
  }),
];
const rsvp = ['principiante','avanzado'].map(programLevel => ({
  scheduleId: 'shared', programCode: 'comandos', programName: 'Comandos',
  programLevel, scheduleName: 'Comandos', startTime: '11:30',
  eligibleCount: 1, confirmedCount: 1, declinedCount: 0, noResponseCount: 0,
}));
const grouped = grouping(rsvp, schedules, programs, [
  { schedule_id: 'cancelled', cancellation_date: day, restored_at: null },
], day);
assert.equal(grouped.length, 2, 'Only real, non-cancelled official classes appear');
assert.equal(grouped.filter(row => row.scheduleId === 'shared').length, 1,
  'Comandos levels must share one class');
assert.equal(grouped.find(row => row.scheduleId === 'shared').eligibleCount, 2);
assert.equal(grouped.find(row => row.scheduleId === 'empty').eligibleCount, 0,
  'Empty official class must appear with zero invented attendees');
assert.ok(sources.admin.includes('getProgramSchedules(tomorrow)')
  && sources.admin.includes('getProgramClassCancellations()'),
  'Admin tomorrow must read official schedules and cancellations');
assert.ok(sources.admin.includes('/trainer-classes?date='),
  'Admin tomorrow class button must navigate to that exact date and schedule');
assert.ok(sources.admin.includes('Sin alumnos inscritos aún'),
  'Empty class should explain why there are no expected attendees');
console.log('UCAPSA UI audit: restaurante, pagos reales y clases oficiales Admin/Entrenador PASS');
