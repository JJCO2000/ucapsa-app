import fs from 'node:fs';

const servicePath = 'src/services/practice.service.ts';
const domainPath = 'src/services/practice.domain.ts';

const service = fs.readFileSync(servicePath, 'utf8');
const domain = fs.readFileSync(domainPath, 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const forbidden of ['supabase', 'AsyncStorage', 'withOperationTimeout', 'DEFAULT_WRITE_TIMEOUT_MS']) {
  if (domain.includes(forbidden)) {
    throw new Error('Practice domain must stay pure; found: ' + forbidden);
  }
}

for (const token of [
  'buildPracticeEngagementStats',
  'localDateKey',
  'startOfLocalWeek',
  'PracticeActivityEntry',
  'PracticeActivitySnapshot',
  'PracticeEngagementStats',
]) {
  if (!domain.includes(token)) {
    throw new Error('Practice domain contract missing: ' + token);
  }
}

if (!service.includes("from './practice.domain'")) {
  throw new Error('Practice service no longer consumes the canonical practice domain.');
}

if (!service.includes("export { buildPracticeEngagementStats } from './practice.domain';")) {
  throw new Error('Practice service lost compatibility re-export for engagement stats.');
}

if (/export function buildPracticeEngagementStats/.test(service)) {
  throw new Error('Practice engagement rules were duplicated back into practice.service.ts.');
}

const serviceLines = service.split(/\r?\n/).length;
const domainLines = domain.split(/\r?\n/).length;
if (serviceLines > 430) {
  throw new Error('Practice service grew beyond its I/O responsibility boundary: ' + serviceLines + ' > 430.');
}
if (domainLines > 190) {
  throw new Error('Practice domain grew beyond its pure-rule responsibility boundary: ' + domainLines + ' > 190.');
}

if (!pkg.includes('"check:practice-service-boundaries"')) {
  throw new Error('npm verify does not include the practice service boundary guard.');
}

console.log('UCAPSA practice domain/service boundary: PASS');
