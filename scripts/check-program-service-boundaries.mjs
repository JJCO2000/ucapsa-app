import fs from 'node:fs';

const service = fs.readFileSync('src/services/programs.service.ts', 'utf8');
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
  if (!service.includes(token)) {
    throw new Error('programs.service.ts stopped re-exporting/using domain contract: ' + token);
  }
}

for (const token of [
  'export function getProgramStatusLabel',
  'export function getProgramLevelLabel',
  'export function sortProgramSchedules',
  'export function formatProgramScheduleDetailLabel',
  'export function isProgramScheduleActiveOnDate',
]) {
  if (service.includes(token)) {
    throw new Error('Pure program rule moved back into programs.service.ts: ' + token);
  }
}

if (/from ['"]\.\/programs\.service['"]/.test(domain)) {
  throw new Error('Program domain has a reverse dependency on programs.service.ts.');
}

const serviceLines = service.split(/\r?\n/).length;
if (serviceLines > 800) {
  throw new Error('programs.service.ts grew past the current boundary: ' + serviceLines + ' lines.');
}

if (!pkg.includes('"check:program-service-boundaries"')) {
  throw new Error('npm verify does not include the program service-boundary guard.');
}

console.log('UCAPSA program domain/service boundary: PASS');
