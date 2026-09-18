import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-internal-lock-table-privileges.sql', 'utf8');
const reminders = fs.readFileSync('supabase/functions/send-class-reminders/index.ts', 'utf8');
const cancellations = fs.readFileSync('supabase/functions/send-class-cancellation/index.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const table of [
  'notification_class_reminder_locks',
  'notification_class_cancellation_locks',
]) {
  const revoke = new RegExp(
    'revoke\\s+all\\s+on\\s+table\\s+public\\.' + table + '\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated',
    'i',
  );
  if (!revoke.test(sql)) {
    throw new Error('Internal lock table is not closed to client roles: ' + table);
  }

  const grant = new RegExp(
    'grant\\s+select\\s*,\\s*insert\\s*,\\s*update\\s+on\\s+table\\s+public\\.' + table + '\\s+to\\s+service_role',
    'i',
  );
  if (!grant.test(sql)) {
    throw new Error('Internal lock table service_role contract missing: ' + table);
  }
}

if (!reminders.includes("serviceClient.from('notification_class_reminder_locks')")) {
  throw new Error('Reminder lock table is no longer accessed through serviceClient.');
}

if (!cancellations.includes("serviceClient.from('notification_class_cancellation_locks')")) {
  throw new Error('Cancellation lock table is no longer accessed through serviceClient.');
}

if (/userClient\.from\(['"]notification_class_(reminder|cancellation)_locks['"]\)/.test(reminders + cancellations)) {
  throw new Error('A user-scoped client started accessing internal notification lock tables.');
}

if (!pkg.includes('"check:internal-lock-privileges"')) {
  throw new Error('npm verify does not include the internal lock privilege guard.');
}

console.log('UCAPSA internal notification lock privileges: PASS');
