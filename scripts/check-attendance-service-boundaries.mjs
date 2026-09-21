import fs from 'node:fs';

const outbox = fs.readFileSync('src/services/attendance-outbox.service.ts', 'utf8');
const sync = fs.readFileSync('src/services/attendance-sync.service.ts', 'utf8');
const attendanceUi = fs.readFileSync('src/app/attendance.tsx', 'utf8');
const rootLayout = fs.readFileSync('src/app/_layout.tsx', 'utf8');
const offlineSync = fs.readFileSync('src/services/client-offline-sync.service.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'AsyncStorage',
  'readAttendanceOutboxStrict',
  'getPendingAttendanceOperations',
  'replaceAttendanceOperation',
  'discardAttendanceOperation',
  'queueClassAttendance',
  'queueMemberVisit',
  'outboxMutationChains',
  'createOfflineUuid',
]) {
  if (!outbox.includes(token)) {
    throw new Error('Attendance outbox persistence contract missing: ' + token);
  }
}

if (/lib\/supabase|\bsupabase\.|registerMyMemberVisitFromQr|withOperationTimeout|syncInFlightByOperation/.test(outbox)) {
  throw new Error('Attendance outbox regained remote synchronization responsibility.');
}

for (const token of [
  "from './attendance-outbox.service'",
  "from './program-attendance.service'",
  "from './member-visits.service'",
  'register_program_attendance_from_qr',
  'p_client_event_id',
  'p_captured_at',
  'syncInFlightByOperation',
  'syncAttendanceOperation',
  'confirmPendingClassAttendance',
  'flushPendingAttendanceOperations',
  'isLikelyNetworkError',
]) {
  if (!sync.includes(token)) {
    throw new Error('Attendance sync contract missing: ' + token);
  }
}

if (/AsyncStorage|createOfflineUuid/.test(sync)) {
  throw new Error('Attendance sync must not own durable outbox persistence or ID generation.');
}
if (/from ['"]\.\/attendance-sync\.service['"]/.test(outbox)) {
  throw new Error('Attendance outbox created a reverse dependency on attendance sync.');
}

if (!/from ['"]\.\.\/services\/attendance-outbox\.service['"]/.test(attendanceUi)
    || !/from ['"]\.\.\/services\/attendance-sync\.service['"]/.test(attendanceUi)) {
  throw new Error('Attendance UI must consume persistence and sync through their focused boundaries.');
}
if (!/from ['"]\.\.\/services\/attendance-sync\.service['"]/.test(rootLayout)) {
  throw new Error('Foreground retry must consume the canonical attendance sync service.');
}
if (!/from ['"]\.\/attendance-sync\.service['"]/.test(offlineSync)) {
  throw new Error('Offline warm/flush must consume the canonical attendance sync service.');
}

if (!/readAttendanceOutboxStrict[\s\S]{0,500}parsed\.every[\s\S]{0,220}throw new Error/.test(outbox)) {
  throw new Error('Attendance outbox lost strict validation before durable mutations.');
}
if (!/try \{[\s\S]{0,180}replaceAttendanceOperation\(operation\.userId, next\)[\s\S]{0,220}catch/.test(sync)) {
  throw new Error('Attendance sync lost protection against secondary local metadata failures.');
}
if (!/result\.status === 'pending' && result\.networkFailure[\s\S]{0,100}break/.test(sync)) {
  throw new Error('Attendance sync no longer stops a flush only for actual network failure.');
}

for (const [name, text, maxLines] of [
  ['attendance outbox', outbox, 290],
  ['attendance sync', sync, 290],
]) {
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    throw new Error(name + ' grew past its responsibility boundary: ' + lines + ' > ' + maxLines + '.');
  }
}

if (!pkg.includes('"check:attendance-service-boundaries"')) {
  throw new Error('npm verify does not include the attendance service boundary guard.');
}

console.log('UCAPSA attendance outbox/sync boundaries: PASS');
