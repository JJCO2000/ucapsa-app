import fs from 'node:fs';

const utility = fs.readFileSync('src/utils/async-storage-queue.utils.ts', 'utf8');
const attendance = fs.readFileSync('src/services/attendance-outbox.service.ts', 'utf8');
const practice = fs.readFileSync('src/services/practice.service.ts', 'utf8');
const valueExposure = fs.readFileSync('src/services/value-exposure-outbox.service.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  "mode: ValidatedQueueReadMode",
  "input.mode === 'strict'",
  'no se sobrescribirá',
]) {
  if (!utility.includes(token)) {
    throw new Error('Strict queue reader contract missing: ' + token);
  }
}

for (const [name, text, required] of [
  [
    'attendance outbox',
    attendance,
    [
      'getPendingAttendanceOperationsStrict',
      "readAttendanceOutbox(userId, 'strict')",
      "readAttendanceOutbox(userId, 'tolerant')",
    ],
  ],
  [
    'practice queue',
    practice,
    [
      "readPending(item.userId, 'strict')",
      "readPending(userId, 'strict')",
    ],
  ],
  [
    'value exposure outbox',
    valueExposure,
    [
      'getPendingValueExposuresStrict',
      "readValueExposureOutbox(userId, 'strict')",
      "readValueExposureOutbox(userId, 'tolerant')",
    ],
  ],
]) {
  for (const token of required) {
    if (!text.includes(token)) {
      throw new Error(name + ' lost strict/tolerant queue separation: ' + token);
    }
  }
}

for (const [name, text] of [
  ['attendance outbox', attendance],
  ['practice queue', practice],
  ['value exposure outbox', valueExposure],
]) {
  if (/catch\s*(?:\([^)]*\))?\s*\{\s*return\s*\[\]\s*;?\s*\}/m.test(text)) {
    throw new Error(name + ' reintroduced catch -> [] queue reads.');
  }
}

if (!pkg.includes('"check:offline-queue-read-integrity"')) {
  throw new Error('npm verify does not include the offline queue read-integrity guard.');
}

console.log('UCAPSA offline queue read integrity: PASS');
