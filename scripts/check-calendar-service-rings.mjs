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
const { buildCalendarServiceKinds, selectCalendarAnnouncementColors } = exports;
const selectedNews = selectCalendarAnnouncementColors([
  { dateKey: '2026-10-18', colorKey: 'purple', priority: 'normal' },
  { dateKey: '2026-10-18', colorKey: 'green', priority: 'urgent' },
  { dateKey: '2026-10-19', colorKey: 'red', priority: 'normal' },
]);
if (selectedNews['2026-10-18'] !== 'green' || selectedNews['2026-10-19'] !== 'red') {
  throw new Error('La noticia de mayor prioridad debe definir un solo color por día.');
}


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
  'ucapsaBrand.colors.adminBorder',
  'Otras actividades', 'Sin actividad', 'Puppy', 'Comandos', 'announcementColorsByDate', 'selectCalendarAnnouncementColors', 'selectCalendarDay', 'scrollTo',
]) {
  if (!calendar.includes(token)) throw new Error('Month calendar lost ring contract: ' + token);
}
for (const token of [
  "import Svg, { Circle } from 'react-native-svg'",
  'strokeDasharray', 'strokeDashoffset', 'rotation={-90}',
  'accessibilityLabel', 'Sin clases ni actividades programadas',
  'KIND_COLORS', 'STROKE', 'segments.length', 'announcementColor', 'ucapsaColorKeyPalette',
]) {
  if (!ring.includes(token)) throw new Error('Ring lost accessible segmented visualization: ' + token);
}
// Dates without scheduled services should read as secondary, not disabled or invisible.
// All numerals retain AA contrast against the white calendar surface.
for (const token of [
  'const RING_SIZE = 40;',
  'const STROKE = 4.5;',
  'hasScheduledService = count > 0',
  'ucapsaBrand.colors.mutedNeutral',
  'ucapsaBrand.colors.text',
  'ucapsaBrand.colors.adminBorder',
  'styles.selectedEmptySurface',
  'styles.selectedServiceSurface',
  "fontSize: 16",
  "fontWeight: '900'",
  'minHeight: 48',
]) {
  if (!ring.includes(token)) throw new Error('Missing legible, quiet empty-day treatment: ' + token);
}
if (!calendar.includes("{ label: 'Sin actividad', color: ucapsaBrand.colors.adminBorder }")) {
  throw new Error('Legend must match the subdued no-class ring.');
}
const brand = fs.readFileSync('src/constants/brand.ts', 'utf8');
function token(key) {
  const match = brand.match(new RegExp(key + ": '([#][0-9a-fA-F]{6})'"));
  if (!match) throw new Error('Missing color token ' + key);
  return match[1];
}
function luminance(hex) {
  const rgb = [1, 3, 5].map((idx) => Number.parseInt(hex.slice(idx, idx + 2), 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
const white = luminance(token('surface'));
for (const type of ['mutedNeutral', 'text']) {
  const ink = luminance(token(type));
  const contrast = (Math.max(white, ink) + 0.05) / (Math.min(white, ink) + 0.05);
  if (contrast < 4.5) throw new Error('Calendar numeral text fails WCAG AA: ' + type + ' ratio ' + contrast.toFixed(2));
}

if (calendar.includes('markedDates={markedDates}') || calendar.includes('monthExpanded ?')) {
  throw new Error('Month calendar reverted to red dots or a secondary weekly view.');
}
// The month being viewed, not today's date, must drive canonical schedule expansion.
const windowSource = fs.readFileSync('src/utils/calendar-date-window.utils.ts', 'utf8');
const windowModule = ts.transpileModule(windowSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const windowExports = {};
vm.runInNewContext(windowModule.outputText, { exports: windowExports });
const { calendarMonthDateKeys } = windowExports;
for (const [month, first, last] of [
  ['2026-10', '2026-10-01', '2026-10-31'],
  ['2028-02', '2028-02-01', '2028-02-29'],
  ['2024-10', '2024-10-01', '2024-10-31'],
  ['2030-08', '2030-08-01', '2030-08-31'],
]) {
  const keys = calendarMonthDateKeys(month, '2026-10-12');
  if (!keys.includes(first) || !keys.includes(last) || !keys.includes('2026-10-12') || new Set(keys).size !== keys.length) {
    throw new Error('Month window failed for historic/future calendar: ' + month);
  }
}
if (!calendar.includes('calendarMonthDateKeys(visibleMonth, selectedDate)')
  || !calendar.includes('onMonthChange=')
  || !calendar.includes('getProgramScheduleTimeline')
  || !calendar.includes('isProgramScheduleActiveOnDate')) {
  throw new Error('Calendar no longer derives availability from canonical versioned schedules in visible month.');
}
for (const token of [
  'calendarDataIncomplete',
  'calendarSources',
  'dataIncomplete={calendarDataIncomplete}',
  'eventCancellations: Boolean(eventCancellationCache)',
  'classes: Boolean(classCache)',
  'events: Boolean(eventCache)',
  'Disponibilidad sin verificar',
]) {
  if (!calendar.includes(token)) throw new Error('Missing partial-fetch detection in calendar: ' + token);
}
for (const token of [
  'dataIncomplete?: boolean',
  "strokeDasharray={dataIncomplete ? '3 4' : undefined}",
  'Información de actividades sin verificar',
]) {
  if (!ring.includes(token)) throw new Error('Missing unknown-ring state: ' + token);
}
console.log('UCAPSA month-only segmented activity rings: PASS');
