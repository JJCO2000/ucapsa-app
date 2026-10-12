import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = 'src/utils/calendar-service-rings.utils.ts';
const source = fs.readFileSync(path, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
vm.runInNewContext(compiled.outputText, { exports });
const { buildCalendarServiceKinds } = exports;

const sample = buildCalendarServiceKinds([
  { dateKey: '2026-10-17', programCode: 'puppy', cancelled: false },
  { dateKey: '2026-10-18', programCode: 'puppy', cancelled: false },
  { dateKey: '2026-10-18', programCode: 'comandos', cancelled: false },
  { dateKey: '2026-10-18', programCode: 'comandos', cancelled: false },
  { dateKey: '2026-10-19', programCode: 'comandos', cancelled: true },
  { dateKey: '2026-10-20', programCode: 'puppy', cancelled: false },
  { dateKey: '2026-10-21', programCode: 'nonstandard', cancelled: false },
], ['2026-10-18', '2026-10-22']);

const equal = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
};
equal(sample['2026-10-17'], ['puppy'], 'Puppy single');
equal(sample['2026-10-18'], ['puppy', 'comandos', 'activity'], 'Three segment ring');
equal(sample['2026-10-19'] ?? [], [], 'Cancelled class should not show active ring');
equal(sample['2026-10-20'], ['puppy'], 'Weekday real class should still appear');
equal(sample['2026-10-21'], ['activity'], 'Another program counts as activity');
equal(sample['2026-10-22'], ['activity'], 'Event without classes counts as activity');
equal(buildCalendarServiceKinds([
  { dateKey: '2026-11-01', programCode: 'puppy', cancelled: false },
  { dateKey: '2026-11-01', programCode: 'comandos', cancelled: false },
], [])['2026-11-01'], ['puppy', 'comandos'], 'Two segment ring');

const calendar = fs.readFileSync('src/app/(tabs)/calendar.tsx', 'utf8');
const ring = fs.readFileSync('src/components/calendar/CalendarActivityRing.tsx', 'utf8');
for (const token of [
  'dayComponent', 'CalendarActivityRing', 'buildCalendarServiceKinds',
  'occurrence.program?.code', 'Boolean(occurrence.cancellation)',
  'ucapsaBrand.colors.borderNeutral',
  'Otras actividades', 'Sin actividad', 'Puppy', 'Comandos',
]) {
  if (!calendar.includes(token)) throw new Error('Month calendar lost ring contract: ' + token);
}
for (const token of [
  "import Svg, { Circle } from 'react-native-svg'",
  'strokeDasharray', 'strokeDashoffset', 'rotation={-90}',
  'accessibilityLabel', 'Sin clases ni actividades programadas',
  'KIND_COLORS', 'STROKE',
]) {
  if (!ring.includes(token)) throw new Error('Ring lost accessible segmented visualization: ' + token);
}
if (calendar.includes('markedDates={markedDates}') || calendar.includes('monthExpanded ?')) {
  throw new Error('Month calendar reverted to red dots or a secondary weekly view.');
}
if (!calendar.includes('daysBehind = 365') || !calendar.includes('daysAhead + daysBehind')) {
  throw new Error('Past months no longer show historical scheduled class rings.');
}
console.log('UCAPSA month-only segmented activity rings: PASS');
