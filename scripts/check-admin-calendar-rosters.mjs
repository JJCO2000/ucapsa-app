import fs from 'node:fs';

const service = fs.readFileSync('src/services/admin-class-roster.service.ts', 'utf8');
const calendar = fs.readFileSync('src/app/(tabs)/calendar.tsx', 'utf8');

for (const token of [
  "row.enrollment.status !== 'active'",
  'row.schedule.id !== scheduleId',
  'card_started_on',
  'card_expires_on',
  "level === 'base' || level === 'principiante'",
  "level === 'medio'",
  "level === 'avanzado'",
  'lastAttendanceDate',
]) {
  if (!service.includes(token)) throw new Error('Admin class roster contract missing: ' + token);
}

for (const token of [
  'getAdminProgramRows',
  'getAdminClassRosterRows',
  'getAdminCommandLevelCounts',
  'Ver inscritos',
  'Administrar fecha',
  'Última asistencia',
]) {
  if (!calendar.includes(token)) throw new Error('Admin calendar roster UI missing: ' + token);
}

for (const token of ['Básico', 'Intermedio', 'Avanzado']) {
  if (!service.includes(token)) throw new Error('Admin roster level label missing: ' + token);
}

console.log('UCAPSA admin calendar rosters: PASS');
