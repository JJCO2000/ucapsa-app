import fs from 'node:fs';

const attendanceOutbox = fs.readFileSync('src/services/attendance-outbox.service.ts', 'utf8');
const attendanceSync = fs.readFileSync('src/services/attendance-sync.service.ts', 'utf8');
const valueExposure = fs.readFileSync('src/services/value-exposure-outbox.service.ts', 'utf8');
const practice = fs.readFileSync('src/services/practice-outbox.service.ts', 'utf8');
const keyed = fs.readFileSync('src/utils/keyed-async.utils.ts', 'utf8');
const competition = fs.readFileSync('src/app/client/competition.tsx', 'utf8');
const constancy = fs.readFileSync('src/app/client/competition-constancy.tsx', 'utf8');
const membership = fs.readFileSync('src/app/client/membership.tsx', 'utf8');
const notifications = fs.readFileSync('src/hooks/useNotifications.ts', 'utf8');
const silentAudit = fs.readFileSync('scripts/audit-silent-catches.mjs', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const [name, text] of [
  ['attendance outbox', attendanceOutbox],
  ['value-exposure outbox', valueExposure],
  ['practice outbox', practice],
]) {
  if (!text.includes('createKeyedMutationSerializer')) {
    throw new Error(name + ' bypasses the canonical keyed mutation serializer.');
  }
}

for (const [name, text] of [
  ['attendance sync', attendanceSync],
  ['value-exposure outbox', valueExposure],
]) {
  if (!text.includes('createKeyedInFlightCoalescer')) {
    throw new Error(name + ' bypasses the canonical in-flight coalescer.');
  }
  if (/new Map<string, Promise/.test(text)) {
    throw new Error(name + ' reintroduced a local Promise map instead of keyed-async.utils.');
  }
}

for (const token of ['createKeyedMutationSerializer', 'createKeyedInFlightCoalescer']) {
  if (!keyed.includes(token)) {
    throw new Error('Canonical keyed async helper missing: ' + token);
  }
}

for (const [name, text, diagnostic] of [
  ['competition summary', competition, 'Could not persist constancy summary value exposure.'],
  ['competition detail', constancy, 'Could not persist constancy detail value exposure.'],
  ['membership', membership, 'Could not refresh profile after membership request.'],
  ['notifications', notifications, 'Could not read notification permission status.'],
]) {
  if (!text.includes('devWarn') || !text.includes(diagnostic)) {
    throw new Error(name + ' lost observable best-effort diagnostics.');
  }
}

if (!silentAudit.includes('findings.length > 0 || promiseFindings.length > 0')) {
  throw new Error('Silent-catch audit no longer blocks unresolved Promise.catch findings.');
}
if (!silentAudit.includes("rel === 'src/utils/keyed-async.utils.ts'")) {
  throw new Error('Canonical keyed serializer exception is no longer explicit in the silent-catch audit.');
}

if (!pkg.includes('"check:keyed-async-boundary"')) {
  throw new Error('npm verify does not include the keyed async boundary guard.');
}

console.log('UCAPSA keyed async SSOT + best-effort observability: PASS');
