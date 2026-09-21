import fs from 'node:fs';

const service = fs.readFileSync('src/services/programs.service.ts', 'utf8');
const core = fs.readFileSync('src/services/programs-core.service.ts', 'utf8');
const schedules = fs.readFileSync('src/services/program-schedules.service.ts', 'utf8');
const enrollments = fs.readFileSync('src/services/program-enrollments.service.ts', 'utf8');
const attendance = fs.readFileSync('src/services/program-attendance.service.ts', 'utf8');
const cancellations = fs.readFileSync('src/services/program-cancellations.service.ts', 'utf8');
const nextSession = fs.readFileSync('src/services/program-next-session.service.ts', 'utf8');
const attendanceSync = fs.readFileSync('src/services/attendance-sync.service.ts', 'utf8');
const sessionInternal = fs.readFileSync('src/services/programs-session.internal.ts', 'utf8');
const domain = fs.readFileSync('src/services/programs.domain.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

if (/lib\/supabase|\bsupabase\.(?:from|rpc|auth|storage)\b|\bcreateClient\s*\(/.test(domain)) {
  throw new Error('programs.domain.ts must stay pure and Supabase-free.');
}

for (const token of [
  'buildOfficialAttendanceQrValue',
  'parseOfficialAttendanceQrValue',
  'getProgramEnrollmentDogName',
  'getProgramStatusLabel',
  'getProgramLevelLabel',
  'sortProgramSchedules',
  'formatProgramScheduleDetailLabel',
  'getNextProgramScheduleDate',
  'isProgramScheduleActiveOnDate',
]) {
  if (!domain.includes('export function ' + token)) {
    throw new Error('Program domain contract missing: ' + token);
  }
  if (!core.includes(token)) {
    throw new Error('programs-core.service.ts stopped re-exporting domain contract: ' + token);
  }
}

for (const [name, text] of [
  ['program schedules', schedules],
  ['program enrollments', enrollments],
  ['program attendance', attendance],
  ['program cancellations', cancellations],
]) {
  for (const token of [
    'export function getProgramEnrollmentDogName',
    'export function getProgramStatusLabel',
    'export function getProgramLevelLabel',
    'export function sortProgramSchedules',
    'export function formatProgramScheduleDetailLabel',
    'export function isProgramScheduleActiveOnDate',
  ]) {
    if (text.includes(token)) {
      throw new Error(name + ' regained a pure program rule: ' + token);
    }
  }
}

for (const line of [
  "export * from './program-schedules.service';",
  "export * from './program-enrollments.service';",
  "export * from './program-attendance.service';",
]) {
  if (!core.includes(line)) {
    throw new Error('programs-core compatibility barrel lost export: ' + line);
  }
}

if (/lib\/supabase|\bsupabase\.|\bfunction\s+|\bconst\s+|\btype\s+[A-Za-z0-9_]+\s*=/.test(core)) {
  throw new Error('programs-core.service.ts must remain a compatibility barrel without implementation.');
}

for (const line of [
  "export * from './programs-core.service';",
  "export * from './program-cancellations.service';",
]) {
  if (!service.includes(line)) {
    throw new Error('programs.service.ts facade lost canonical export: ' + line);
  }
}

if (/lib\/supabase|\bsupabase\.|\bfunction\s+|\bconst\s+/.test(service)) {
  throw new Error('programs.service.ts facade regained implementation logic.');
}

for (const token of [
  'getPrograms',
  'getProgramSchedules',
  'getProgramScheduleTimeline',
  'getProgramScheduleFromTimeline',
  'changeProgramScheduleFromDate',
  'updateProgramSchedule',
]) {
  if (!schedules.includes(token)) {
    throw new Error('Program schedules boundary missing operation: ' + token);
  }
}

for (const token of [
  'getMyProgramEnrollments',
  'getAdminProgramRows',
  'getProgramClientProfiles',
  'createProgramEnrollment',
  'updateProgramEnrollment',
  'setProgramEnrollmentStatus',
  'getProgramEnrollmentByQrToken',
]) {
  if (!enrollments.includes(token)) {
    throw new Error('Program enrollments boundary missing operation: ' + token);
  }
}

for (const token of [
  'getProgramSessionScheduleMap',
  'getOfficialAttendanceQrCodes',
  'registerMyProgramAttendanceFromQr',
  'registerProgramAttendance',
  'correctProgramAttendance',
  'deleteProgramAttendance',
  'setProgramEnrollmentAttendanceCount',
]) {
  if (!attendance.includes(token)) {
    throw new Error('Program attendance boundary missing operation: ' + token);
  }
}

for (const token of [
  'getProgramClassCancellations',
  'getProgramClassCancellationByAnnouncementId',
  'createProgramClassCancellation',
  'createProgramDayCancellations',
  'restoreProgramClassCancellation',
]) {
  if (!cancellations.includes('export async function ' + token)) {
    throw new Error('Program cancellation boundary missing operation: ' + token);
  }
}

if (!/from ['"]\.\/program-schedules\.service['"]/.test(enrollments)) {
  throw new Error('Program enrollments must depend on canonical schedules.');
}
if (!/from ['"]\.\/programs-session\.internal['"]/.test(enrollments)) {
  throw new Error('Program enrollments stopped sharing the internal user-session lookup.');
}
if (!/from ['"]\.\/program-schedules\.service['"]/.test(cancellations)) {
  throw new Error('Program cancellations must depend on canonical schedules.');
}
if (!/from ['"]\.\/programs-session\.internal['"]/.test(cancellations)) {
  throw new Error('Program cancellations stopped sharing the internal user-session lookup.');
}

for (const [name, text] of [
  ['program schedules', schedules],
  ['program enrollments', enrollments],
  ['program attendance', attendance],
  ['program cancellations', cancellations],
  ['program next-session', nextSession],
  ['attendance sync', attendanceSync],
  ['program domain', domain],
]) {
  if (/from ['"]\.\/programs\.service['"]/.test(text)) {
    throw new Error(name + ' created a reverse dependency through the public programs facade.');
  }
  if (/from ['"]\.\/programs-core\.service['"]/.test(text)) {
    throw new Error(name + ' depends on the programs compatibility barrel instead of a focused module.');
  }
}

if (!/from ['"]\.\/program-cancellations\.service['"]/.test(nextSession)
    || !/from ['"]\.\/program-schedules\.service['"]/.test(nextSession)
    || !/from ['"]\.\/programs\.domain['"]/.test(nextSession)) {
  throw new Error('Program next-session must consume focused cancellation/schedule/domain modules.');
}

if (!/from ['"]\.\/program-attendance\.service['"]/.test(attendanceSync)) {
  throw new Error('Attendance sync must consume the canonical program attendance contract directly.');
}

if (service.includes('programs-session.internal')) {
  throw new Error('Internal program session helper leaked through the public facade.');
}

const limits = [
  ['program facade', service, 20],
  ['program core barrel', core, 45],
  ['program schedules', schedules, 230],
  ['program enrollments', enrollments, 280],
  ['program attendance', attendance, 190],
  ['program cancellations', cancellations, 320],
  ['program next-session', nextSession, 190],
];

for (const [name, text, maxLines] of limits) {
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    throw new Error(name + ' grew past its responsibility boundary: ' + lines + ' lines.');
  }
}

if (!/supabase\.auth\.getUser\(\)/.test(sessionInternal)) {
  throw new Error('Program internal session lookup changed without an explicit boundary update.');
}

if (!pkg.includes('"check:program-service-boundaries"')) {
  throw new Error('npm verify does not include the program service-boundary guard.');
}

console.log('UCAPSA program responsibility boundaries: PASS');
