import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real pure grouping function with synthetic schedules only.
const source = fs.readFileSync('src/app/(tabs)/trainer-classes.tsx', 'utf8');
const programsSource = fs.readFileSync('src/services/programs.domain.ts', 'utf8');
function loadModule(code, extras = {}) {
  const compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const mod = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module: mod, exports: mod.exports, Map, Set, Date, ...extras,
  });
  return mod.exports;
}
const domain = loadModule(programsSource);
const start = source.indexOf('function groupRoster(');
const end = source.indexOf('\nexport default function TrainerClassesTab()', start);
assert.ok(start >= 0 && end > start, 'Roster grouping function missing');
const excerpt = source.slice(start, end) + '\nexports.groupRoster = groupRoster;\n';
const groupRoster = loadModule(excerpt, {
  isProgramScheduleActiveOnDate: domain.isProgramScheduleActiveOnDate,
}).groupRoster;
assert.equal(typeof groupRoster, 'function');


for (const token of [
  "const canMarkAttendance = dateKey === today && !loading && !error",
  "if (row.attended || busyId || loading || error || dateKey !== localDateKey()) return;",
  "if (row.absent || row.attended || busyId || loading || error || dateKey !== localDateKey()) return;",
  "if (busyId || loading || error || stagedWarning || row.attended",
]) {
  assert.ok(source.includes(token), 'Attendance must not mutate on stale/unverified roster: ' + token);
}
const date = '2026-10-18'; // Sunday
const programs = [
  { id: 'puppy', code: 'puppy', is_active: true },
  { id: 'comandos', code: 'comandos', is_active: true },
];
const schedule = (id, program_id, start_time, extras = {}) => ({
  id, program_id, name: id, start_time,
  day_of_week: 0, is_active: true, repeat_type: 'weekly', ...extras,
});
const official = {
  programs,
  schedules: [
    schedule('empty-puppy', 'puppy', '12:30:00'),
    schedule('comandos-only', 'comandos', '11:30:00'),
    schedule('cancelled', 'puppy', '13:30:00'),
    schedule('off-cycle', 'puppy', '14:30:00',
      { repeat_type: 'biweekly', cycle_start_date: '2026-10-11' }),
    schedule('inactive', 'puppy', '15:30:00', { is_active: false }),
  ],
  cancellations: [
    { schedule_id: 'cancelled', cancellation_date: date, restored_at: null },
  ],
};
const rows = [
  { scheduleId: 'comandos-only', programCode: 'comandos', startTime: '11:30',
    enrollmentId: 'basic', programLevel: 'principiante' },
  { scheduleId: 'comandos-only', programCode: 'comandos', startTime: '11:30',
    enrollmentId: 'advanced', programLevel: 'avanzado' },
];
const grouped = groupRoster(rows, official, date);
assert.equal(grouped.length, 2, 'Only effective, non-cancelled class times should appear');
const puppy = grouped.find((g) => g.scheduleId === 'empty-puppy');
assert.ok(puppy, 'An official class with zero enrolled students must be visible');
assert.equal(puppy.rows.length, 0, 'Empty class must never invent attendees');
const comandos = grouped.find((g) => g.scheduleId === 'comandos-only');
assert.equal(comandos.rows.length, 2,
  'Shared Comandos schedule must contain Basic and Advanced in one group');
assert.equal(grouped.filter((g) => g.scheduleId === 'comandos-only').length, 1);
assert.ok(!grouped.some((g) => g.scheduleId === 'cancelled' || g.scheduleId === 'off-cycle'));
assert.ok(source.includes('getProgramSchedules(dateKey)'), 'Must project schedule versions for selected date');
assert.ok(source.includes('getProgramClassCancellations()'), 'Must respect official cancellations');
assert.ok(source.includes('Sin alumnos inscritos en este horario.'),
  'Empty official classes need an explicit accessible description');
assert.ok(source.includes("const canMarkAttendance = dateKey === today"),
  'Historical dates must remain read-only in Trainer');
console.log('UCAPSA roster: official empty schedules, Comandos, cancellations, cycles PASS');
