import fs from 'node:fs';

const announcementEdge = fs.readFileSync('supabase/functions/send-announcement-reminders/index.ts', 'utf8');
const classEdge = fs.readFileSync('supabase/functions/send-class-reminders/index.ts', 'utf8');
const cronSql = fs.readFileSync('supabase/sql/ucapsa-class-reminders-cron.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  "status: 'queued'",
  ".from('notification_deliveries')",
  ".insert(queuedRows)",
  ".update({ status: 'sending' })",
  "fetch('https://exp.host/--/api/v2/push/send'",
  "expoErrorCode === 'DeviceNotRegistered'",
  'No se envió ningún push; el recordatorio puede reintentarse de forma segura.',
  'El resultado del envío es incierto. No se reintentó automáticamente.',
]) {
  if (!announcementEdge.includes(token)) {
    throw new Error('Announcement reminder delivery safety missing: ' + token);
  }
}

const announcementDeliveryInsert = announcementEdge.indexOf(".insert(queuedRows)");
const announcementFetch = announcementEdge.indexOf("fetch('https://exp.host/--/api/v2/push/send'");
if (announcementDeliveryInsert < 0 || announcementFetch < 0 || announcementDeliveryInsert > announcementFetch) {
  throw new Error('Announcement reminders must persist delivery evidence before Expo.');
}

for (const token of [
  'card_started_on',
  'card_expires_on',
  "date.getUTCFullYear() === year",
  "date.getUTCMonth() === month - 1",
  "date.getUTCDate() === day",
  "target_date inválido.",
  "Math.trunc(Number(payload.days_ahead))",
  "classDateKey >= String(enrollment.card_started_on)",
  "classDateKey <= String(enrollment.card_expires_on)",
  "serviceClient.rpc('get_internal_cron_secret')",
  "lock.status !== 'failed'",
  "ignoreDuplicates: true",
  "campaign_id: null",
  "status: 'dry_run'",
  'no se crearon campañas, locks ni entregas',
  'deliveryTargetByTokenId',
  'reminders: [{ enrollment, schedule, program }]',
  "status: 'queued'",
  ".insert(queuedRows)",
  ".update({ status: 'sending' })",
  "expoErrorCode === 'DeviceNotRegistered'",
  'total_targets: deliveryTargets.length',
]) {
  if (!classEdge.includes(token)) {
    throw new Error('Class reminder safety contract missing: ' + token);
  }
}

if (/const deliveryTargets = reminderTargets\.flatMap/.test(classEdge)) {
  throw new Error('Class reminders regressed to one delivery per enrollment instead of one per token.');
}

const classDeliveryInsert = classEdge.indexOf(".insert(queuedRows)");
const classFetch = classEdge.indexOf("fetch('https://exp.host/--/api/v2/push/send'");
if (classDeliveryInsert < 0 || classFetch < 0 || classDeliveryInsert > classFetch) {
  throw new Error('Class reminders must persist delivery evidence before Expo.');
}

const dryRunAt = classEdge.indexOf("if (dryRun)");
const campaignInsertAt = classEdge.indexOf(".from('notification_campaigns')", dryRunAt);
if (dryRunAt < 0 || campaignInsertAt < 0 || dryRunAt > campaignInsertAt) {
  throw new Error('Class reminder dry-run must finish before campaign side effects.');
}

for (const token of [
  "where jobname = 'send-class-reminders-next-day'",
  "perform cron.unschedule(v_job_id)",
  "'send-class-reminders-next-day'",
  "'0 16 * * *'",
  "'/functions/v1/send-class-reminders'",
  "'x-cron-secret'",
  '{"days_ahead":1,"reminder_type":"class_24h"}',
  'timeout_milliseconds := 30000',
]) {
  if (!cronSql.includes(token)) {
    throw new Error('Class reminder cron contract missing: ' + token);
  }
}

if (!pkg.includes('"check:automatic-reminders"')) {
  throw new Error('npm verify does not include automatic reminder safety guard.');
}

console.log('UCAPSA automatic reminder delivery, idempotency and scheduling: PASS');
