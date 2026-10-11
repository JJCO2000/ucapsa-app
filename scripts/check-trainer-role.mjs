import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const appTypes = read('src/types/app.types.ts');
const dbTypes = read('src/types/database.generated.ts');
const capabilities = read('src/constants/roleCapabilities.ts');
const session = read('src/hooks/useSession.tsx');
const tabs = read('src/app/(tabs)/_layout.tsx');
const trainerHome = read('src/app/(tabs)/trainer-home.tsx');
const trainerClasses = read('src/app/(tabs)/trainer-classes.tsx');
const trainerExams = read('src/app/(tabs)/trainer-exams.tsx');
const trainerMore = read('src/app/(tabs)/trainer-more.tsx');
const dogNotes = read('src/app/staff/dog-notes.tsx');
const examAttempt = read('src/app/staff/exam-attempt.tsx');
const report = read('src/app/staff/training-report.tsx');
const trainerService = read('src/services/trainer-staff.service.ts');
const trainerSql = read('supabase/sql/ucapsa-trainer-workspace.sql');
const users = read('src/app/admin/users.tsx');
const adminHome = read('src/app/(tabs)/admin-home.tsx');
const notificationCard = read('src/components/domain/NotificationSettingsCard.tsx');
const notificationNav = read('src/hooks/useNotificationNavigation.ts');
const trainerSummary = read('supabase/functions/send-trainer-class-summary/index.ts');
const trainerCron = read('supabase/sql/ucapsa-trainer-class-summary-cron.sql');
const trainerLocks = read('supabase/sql/ucapsa-trainer-class-summary-notifications.sql');
const pkg = read('package.json');

for (const token of [
  "'client' | 'member' | 'trainer' | 'admin' | 'super_admin'",
]) {
  if (!appTypes.includes(token)) throw new Error('App role contract missing trainer: ' + token);
}
if (!dbTypes.includes('app_role: "client" | "member" | "trainer" | "admin" | "super_admin"')) {
  throw new Error('Generated DB enum union is missing trainer.');
}

for (const token of [
  'canManageClassRoster: true',
  'canRecordAttendance: true',
  'canCaptureExamResults: true',
  'canUploadExamResults: true',
  'canViewInternalDogNotes: true',
  'canRequestMembershipReview: true',
  'canExportOperationalReports: true',
  'canManagePayments: false',
  'canManageCommunications: false',
  'canManageSchedules: false',
  'canConfigureExamStructure: false',
  'canPublishExamResults: false',
  'canViewGlobalAnalytics: false',
  'canManageStaffRoles: true',
]) {
  if (!capabilities.includes(token)) throw new Error('Trainer capability matrix missing: ' + token);
}

for (const token of ['isTrainer', 'isStaff', 'capabilities', 'getRoleCapabilities(role)']) {
  if (!session.includes(token)) throw new Error('Session role boundary missing: ' + token);
}

for (const token of [
  'name="trainer-home"',
  'name="trainer-classes"',
  'name="trainer-exams"',
  'name="trainer-more"',
  "initialRouteName={isAdmin ? 'admin-home' : isTrainer ? 'trainer-home' : 'home'}",
  "href: isStaff ? null : '/home'",
]) {
  if (!tabs.includes(token)) throw new Error('Trainer tab mode missing: ' + token);
}

for (const token of [
  'getStaffClassSummary',
  'tomorrowKey()',
  'Quién esperamos',
  "item.programCode === 'comandos'",
  'levels.map',
]) {
  if (!trainerHome.includes(token)) throw new Error('Trainer tomorrow dashboard missing: ' + token);
}

for (const token of [
  'getStaffClassRoster',
  'registerStaffAttendance',
  'requestMembershipReviewFromStaff',
  '/staff/dog-notes?dogId=',
  'row.safetyNote',
]) {
  if (!trainerClasses.includes(token)) throw new Error('Trainer class operations missing: ' + token);
}

for (const token of [
  'createTrainerExamAttempt',
  'getTrainerExamItems',
  'uploadTrainerExamResults',
  'pickAndParseUcapsaExamXlsx',
  'Subir Excel',
  'Capturar',
]) {
  if (!trainerExams.includes(token)) throw new Error('Trainer exam operations missing: ' + token);
}

for (const token of [
  'saveTrainerExamResult',
  'reviewTrainerExamAttempt',
  'Enviar a revisión',
]) {
  if (!examAttempt.includes(token)) throw new Error('Trainer grading flow missing: ' + token);
}

for (const token of [
  'getStaffDogNotes',
  'addStaffDogNote',
  'resolveStaffDogNote',
  'Estas notas son internas',
]) {
  if (!dogNotes.includes(token)) throw new Error('Internal dog-history flow missing: ' + token);
}

for (const token of [
  'getStaffTrainingReport',
  'exportTrainingReportXlsx',
  'Exportar Excel',
]) {
  if (!report.includes(token)) throw new Error('Trainer report export missing: ' + token);
}
if (!trainerMore.includes('/staff/training-report')) {
  throw new Error('Trainer tools lost report entry point.');
}

for (const token of [
  'create or replace function public.is_ucapsa_trainer()',
  'create or replace function public.is_ucapsa_staff()',
  'ucapsa_staff_dog_notes',
  'get_staff_class_roster',
  'staff_register_program_attendance',
  'staff_request_membership_review',
  'get_staff_training_report',
  'trainer_create_ucapsa_exam_attempt',
  'trainer_upsert_ucapsa_exam_item_result',
  'trainer_review_ucapsa_exam_attempt',
  'trainer_import_ucapsa_exam_results',
  'reviewed_pending_admin_publish',
  'superadmin_set_profile_role',
]) {
  if (!trainerSql.includes(token)) throw new Error('Trainer SQL boundary missing: ' + token);
}

if (/trainer_import_ucapsa_exam_results[sS]*admin_publish_ucapsa_exam_attempt/.test(trainerSql)) {
  throw new Error('Trainer bulk upload must not publish or officialize exam attempts.');
}

for (const token of [
  "role === 'trainer'",
  'Entrenador',
  'setStaffRoleSuperAdmin',
  'Acceso del equipo',
]) {
  if (!users.includes(token)) throw new Error('Superadmin trainer management missing: ' + token);
}

for (const token of [
  'groupTomorrowClasses',
  "item.programCode === 'comandos'",
  'tomorrowLevels',
]) {
  if (!adminHome.includes(token)) throw new Error('Admin tomorrow summary must treat Comandos as one schedule: ' + token);
}

for (const token of [
  "mode?: 'client' | 'trainer'",
  "mode === 'trainer'",
  "item.key === 'classes'",
]) {
  if (!notificationCard.includes(token)) throw new Error('Trainer notification preference missing: ' + token);
}
if (!notificationNav.includes("source === 'trainer_class_summary'")) {
  throw new Error('Trainer summary push lost its navigation target.');
}

for (const token of [
  ".eq('role', 'trainer')",
  ".eq('class_date', classDate)",
  "preferences.get(token.user_id)?.classes",
  'notification_trainer_summary_locks',
  "source: 'trainer_class_summary'",
  'Aforo de mañana',
]) {
  if (!trainerSummary.includes(token)) throw new Error('Trainer summary notification missing: ' + token);
}

for (const token of [
  'notification_trainer_summary_locks_unique',
  'revoke all on table public.notification_trainer_summary_locks from public, anon, authenticated',
]) {
  if (!trainerLocks.includes(token)) throw new Error('Trainer notification lock hardening missing: ' + token);
}

for (const token of [
  "'send-trainer-class-summary-next-day'",
  "'0 1 * * *'",
  "'/functions/v1/send-trainer-class-summary'",
  "'x-cron-secret'",
]) {
  if (!trainerCron.includes(token)) throw new Error('Trainer summary cron missing: ' + token);
}

for (const token of [
  "supabase.rpc('get_staff_class_roster'",
  "supabase.rpc('staff_register_program_attendance'",
  "supabase.rpc('trainer_import_ucapsa_exam_results'",
]) {
  if (!trainerService.includes(token)) throw new Error('Trainer app service boundary missing: ' + token);
}

if (!pkg.includes('"check:trainer-role"')) {
  throw new Error('npm verify does not include trainer role guard.');
}

console.log('UCAPSA trainer role, least privilege, exams, staff notes, reporting and next-day summary: PASS');
