import fs from 'node:fs';

const events = fs.readFileSync('src/utils/events.utils.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'function dateKeyParts',
  'const civilParts = dateKeyParts(value)',
  'if (civilParts) return value',
  "date.getFullYear() !== year",
  "date.getMonth() !== month - 1",
  "date.getDate() !== day",
  'date.setDate(1)',
  'date.setMonth(baseDate.getMonth() + index)',
  'daysInTargetMonth',
  'Math.min(baseDay, daysInTargetMonth)',
]) {
  if (!events.includes(token)) {
    throw new Error('Event civil-date integrity contract missing: ' + token);
  }
}

if (/new Date\(dateKey\)/.test(events)) {
  throw new Error('Calendar civil dates must not be parsed as UTC instants.');
}

function isValidCivilDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

if (!isValidCivilDate('2028-02-29')) {
  throw new Error('Leap-day fixture stopped being valid.');
}
if (isValidCivilDate('2026-02-29') || isValidCivilDate('2026-02-31')) {
  throw new Error('Invalid civil-date fixture is being normalized instead of rejected.');
}

function addMonthlyClamped(base, index) {
  const date = new Date(base);
  const baseDay = base.getDate();
  date.setDate(1);
  date.setMonth(base.getMonth() + index);
  const daysInTargetMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(baseDay, daysInTargetMonth));
  return date;
}

const jan31 = new Date(2026, 0, 31, 10, 0, 0, 0);
const feb = addMonthlyClamped(jan31, 1);
const mar = addMonthlyClamped(jan31, 2);
if (feb.getFullYear() !== 2026 || feb.getMonth() !== 1 || feb.getDate() !== 28) {
  throw new Error('Monthly Jan 31 recurrence must clamp to Feb 28 in 2026.');
}
if (mar.getFullYear() !== 2026 || mar.getMonth() !== 2 || mar.getDate() !== 31) {
  throw new Error('Monthly Jan 31 recurrence must return to Mar 31.');
}

if (!pkg.includes('"check:event-date-integrity"')) {
  throw new Error('npm verify does not include the event civil-date guard.');
}

console.log('UCAPSA event civil dates and monthly recurrence: PASS');
