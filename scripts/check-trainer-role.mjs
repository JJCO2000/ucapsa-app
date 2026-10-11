import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const enumSql = read('supabase/sql/ucapsa-trainer-00-role.sql');
const roleSql = read('supabase/sql/ucapsa-trainer-operations.sql');
const appTypes = read('src/types/app.types.ts');
const dbTypes = read('src/types/database.generated.ts');
const session = read('src/hooks/useSession.tsx');
const tabs = read('src/app/(tabs)/_layout.tsx');
const trainerHome = read('src/app/(tabs)/trainer-home.tsx');
const trainerDogs = read('src/app/(tabs)/trainer-dogs.tsx');
const trainerExams = read('src/app/(tabs)/trainer-exams.tsx');
const trainerReports = read('src/app/(tabs)/trainer-reports.tsx');
const examAttempt = read('src/app/trainer/exam-attempt.tsx');
const users = read('src/app/admin/users.tsx');
const rsvp = read('src/services/class-rsvp.service.ts');
const reminderCron = read('supabase/sql/ucapsa-class-reminders-cron.sql');
const exportService = read('src/services/staff-report-export.service.ts');
const pkg = read('package.json');

for (const [source, token] of [
  [appTypes, "'trainer'"],
  [dbTypes, '"trainer"'],
  [session, "const isTrainer = role === 'trainer'"],
  [session, 'const isStaff = isAdmin || isTrainer'],
  [tabs, "initialRouteName={isAdmin ? 'admin-home' : isTrainer ? 'trainer-home' : 'home'}"],
  [tabs, 'name="trainer-home"'],
  [tabs, 'name="trainer-dogs"'],
  [tabs, 'name="trainer-exams"'],
  [tabs, 'name="trainer-reports"'],
]) {
  if (!source.includes(token)) throw new Error('Trainer role surface missing: ' + token);
}

if (!enumSql.includes("alter type public.app_role add value if not exists 'trainer'")) {
  throw new Error('Trainer enum migration missing.');
}

for (const token of [
  'is_ucapsa_trainer()',
  'is_ucapsa_training_staff()',
  'dog_staff_notes',
  'get_staff_class_rsvp_summary',
  'get_staff_class_roster',
  'get_staff_class_report',
  'get_staff_dog_directory',
  'staff_add_dog_note',
  'get_staff_published_exams',
  'trainer_create_ucapsa_exam_attempt',
  'trainer_upsert_ucapsa_exam_item_result',
  'trainer_review_ucapsa_exam_attempt',
  'superadmin_set_trainer_role',
]) {
  if (!roleSql.includes(token)) throw new Error('Trainer SQL contract missing: ' + token);
}

if (!/group by[\s\S]*x\.schedule_id[\s\S]*x\.program_level[\s\S]*x\.start_time/i.test(roleSql)) {
  throw new Error('Class capacity must group one Comandos schedule by level.');
}
if (!trainerHome.includes("const key = `${row.programCode}:${row.scheduleId}:${row.startTime}`")) {
  throw new Error('Trainer Home must treat Comandos as one schedule/time with level rows.');
}
if (!trainerHome.includes('getProgramLevelLabel(row.programLevel')) {
  throw new Error('Trainer Home lost Básico/Intermedio/Avanzado breakdown.');
}

for (const source of [trainerHome, trainerDogs, trainerExams, trainerReports, examAttempt]) {
  for (const forbidden of ['/admin-payments', '/admin/members', '/admin-communication', 'getAdminPayment', 'getAdminMembership']) {
    if (source.includes(forbidden)) throw new Error('Trainer UI exposes internal administration: ' + forbidden);
  }
}

if (/trainer_[a-z0-9_]*(?:publish|official|membership|payment)/i.test(roleSql)) {
  throw new Error('Trainer SQL gained publishing, membership or payment authority.');
}
if (/\b(?:insert\s+into|update|delete\s+from)\s+public\.memberships\b/i.test(roleSql)) {
  throw new Error('Trainer operations must not mutate memberships.');
}
if (/\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:payments|payment_obligations|payment_settings)\b/i.test(roleSql)) {
  throw new Error('Trainer operations must not mutate financial tables.');
}
if (/update\s+public\.dog_staff_notes/i.test(roleSql)) {
  throw new Error('Dog staff history must remain append-only.');
}

for (const token of [
  "profile.role === 'trainer'",
  'Convertir en Entrenador',
  "role === 'super_admin'",
  'setTrainerRole',
]) {
  if (!users.includes(token)) throw new Error('Superadmin trainer assignment missing: ' + token);
}

for (const token of [
  "timeZone: 'America/Mexico_City'",
  'tomorrowDateKey',
]) {
  if (!rsvp.includes(token)) throw new Error('Tomorrow RSVP date is not anchored to Mexico City: ' + token);
}
if (!reminderCron.includes('{"days_ahead":1,"reminder_type":"class_24h"}')) {
  throw new Error('Class reminder stopped targeting the next calendar day.');
}

for (const token of ['zipSync', '.xlsx', 'expo-sharing', 'getStaffClassReport']) {
  if (!(exportService + trainerReports).includes(token)) throw new Error('Operational Excel export missing: ' + token);
}

if (!pkg.includes('"check:trainer-role"')) {
  throw new Error('npm verify does not include trainer role guard.');
}

console.log('UCAPSA trainer least-privilege operations: PASS');
