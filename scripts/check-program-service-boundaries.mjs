import fs from 'node:fs';

const service = fs.readFileSync('src/services/programs.service.ts', 'utf8');
const core = fs.readFileSync('src/services/programs-core.service.ts', 'utf8');
const cancellations = fs.readFileSync('src/services/program-cancellations.service.ts', 'utf8');
const sessionInternal = fs.readFileSync('src/services/programs-session.internal.ts', 'utf8');
const domain = fs.readFileSync('src/services/programs.domain.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

if (/lib\/supabase|\bsupabase\.(?:from|rpc|auth|storage)\b|\bcreateClient\s*\(/.test(domain)) {
  throw new Error('programs.domain.ts must stay pure and Supabase-free.');
}

for (const token of [
  'buildOfficialAttendanceQrValue',
  'parseOfficialAttendanceQrValue',
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
    throw new Error('programs-core.service.ts stopped re-exporting/using domain contract: ' + token);
  }
}

for (const token of [
  'export function getProgramStatusLabel',
  'export function getProgramLevelLabel',
  'export function sortProgramSchedules',
  'export function formatProgramScheduleDetailLabel',
  'export function isProgramScheduleActiveOnDate',
]) {
  if (core.includes(token) || cancellations.includes(token)) {
    throw new Error('Pure program rule moved back into an I/O service: ' + token);
  }
}

for (const token of [
  "export * from './programs-core.service';",
  "export * from './program-cancellations.service';",
]) {
  if (!service.includes(token)) {
    throw new Error('programs.service.ts facade lost canonical export: ' + token);
  }
}

if (/lib\/supabase|\bsupabase\.|\bfunction\s+|\bconst\s+/.test(service)) {
  throw new Error('programs.service.ts facade regained implementation logic.');
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
  if (core.includes('function ' + token)) {
    throw new Error('Program cancellation operation moved back into programs-core.service.ts: ' + token);
  }
}

if (!cancellations.includes("from './programs-core.service'")) {
  throw new Error('Cancellation module stopped consuming the internal program core.');
}
if (/from ['"]\.\/programs\.service['"]/.test(cancellations)) {
  throw new Error('Cancellation module created a circular dependency through the public facade.');
}

if (!core.includes("from './programs-session.internal'") || !cancellations.includes("from './programs-session.internal'")) {
  throw new Error('Program modules stopped sharing the internal user-session lookup.');
}
if (service.includes('programs-session.internal')) {
  throw new Error('Internal program session helper leaked through the public facade.');
}

if (/from ['"]\.\/programs\.service['"]/.test(domain)) {
  throw new Error('Program domain has a reverse dependency on programs.service.ts.');
}

const facadeLines = service.split(/\r?\n/).length;
const coreLines = core.split(/\r?\n/).length;
const cancellationLines = cancellations.split(/\r?\n/).length;
if (facadeLines > 20) {
  throw new Error('programs.service.ts facade grew implementation again: ' + facadeLines + ' lines.');
}
if (coreLines > 520) {
  throw new Error('programs-core.service.ts grew past the current boundary: ' + coreLines + ' lines.');
}
if (cancellationLines > 320) {
  throw new Error('program-cancellations.service.ts grew past the current boundary: ' + cancellationLines + ' lines.');
}

if (!/supabase\.auth\.getUser\(\)/.test(sessionInternal)) {
  throw new Error('Program internal session lookup changed without an explicit boundary update.');
}

if (!pkg.includes('"check:program-service-boundaries"')) {
  throw new Error('npm verify does not include the program service-boundary guard.');
}

console.log('UCAPSA program facade/core/cancellation/domain boundaries: PASS');
