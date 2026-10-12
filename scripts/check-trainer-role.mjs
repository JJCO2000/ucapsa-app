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
const trainerModeSql = read('supabase/sql/ucapsa-trainer-workspace-exam-upload.sql');
const comandosScheduleSql = read('supabase/sql/ucapsa-comandos-single-schedule.sql');
const trainerSqlAll = trainerSql + '\n' + trainerModeSql;
const staffWorkspace = read('src/hooks/useStaffWorkspace.tsx');
const staffWorkspaceService = read('src/services/staff-workspace-storage.service.ts');
const staffSwitcher = read('src/components/domain/StaffWorkspaceSwitcher.tsx');
const examXlsx = read('src/services/ucapsa-exam-xlsx.ts');
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
  'canUseTrainingWorkspace: true',
  'canSwitchStaffWorkspace: true',
  'canManageClassRoster: true',
  'canRecordAttendance: true',
  'canUploadExamDefinition: true',
  'canPublishExamDefinition: true',
  'canCaptureExamResults: true',
  'canUploadExamResults: true',
  'canViewOperationalDogData: true',
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
  "initialRouteName={trainerWorkspace ? 'trainer-home' : adminWorkspace ? 'admin-home' : 'home'}",
  "href: trainerWorkspace ? '/trainer-home' : null",
  "href: adminWorkspace ? '/admin-home' : null",
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

if (!trainerHome.includes("const key = `${row.scheduleId}:${row.startTime}:${row.programCode}`")) {
  throw new Error('Comandos debe conservar un solo horario compartido; el nivel no puede crear otro horario.');
}
if (trainerHome.includes("row.programLevel}:") || trainerHome.includes(":${row.programLevel}")) {
  throw new Error('Básico, Intermedio y Avanzado comparten horario; el nivel no puede convertirse en otro schedule.');
}
if (!trainerClasses.includes("const key = `${row.scheduleId}:${row.programCode}:${row.startTime}`")) {
  throw new Error('El roster de Comandos debe partir del horario compartido y conservar el nivel en cada inscripción.');
}

for (const token of [
  'enforce_single_commands_schedule',
  "v_program_code = 'comandos'",
  'ps.id <> new.id',
  'Comandos usa un solo horario compartido',
]) {
  if (!comandosScheduleSql.includes(token)) {
    throw new Error('DB invariant for shared Comandos schedule missing: ' + token);
  }
}

for (const token of ['levelLabel(row.programLevel)', 'levelPill', 'Básico', 'Intermedio', 'Avanzado']) {
  if (!trainerClasses.includes(token) && !trainerHome.includes(token)) {
    throw new Error('Comandos perdió la clasificación visible por nivel: ' + token);
  }
}

for (const token of [
  'getStaffClassRoster',
  'registerStaffAttendance',
  'markStaffAbsence',
  'No asistió',
  'requestMembershipReviewFromStaff',
  '/staff/dog-notes?dogId=',
  'row.safetyNote',
]) {
  if (!trainerClasses.includes(token)) throw new Error('Trainer class operations missing: ' + token);
}

for (const token of [
  'createTrainerExamAttempt',
  'createTrainerExamDraft',
  'getTrainerExamItems',
  'uploadTrainerExamResults',
  'pickAndParseUcapsaExamXlsx',
  'pickAndParseUcapsaExamDefinitionXlsx',
  'Subir examen',
  'Guardar borrador',
  'Subir Excel',
  'Capturar',
  'publishTrainerExam',
  'Publicar',
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
  'getStaffDogOperationalProfile',
  'Datos para entrenamiento',
  'Alergias',
  'Medicamentos',
  'addStaffDogNote',
  'resolveStaffDogNote',
  'Estas notas son internas',
]) {
  if (!dogNotes.includes(token)) throw new Error('Internal dog-history flow missing: ' + token);
}

for (const token of [
  'getStaffTrainingReport',
  'exportTrainingReportXlsx',
  'buildTrainingReportStats',
  'Exportar estadísticas',
]) {
  if (!report.includes(token)) throw new Error('Trainer report export missing: ' + token);
}
const reportExport = read('src/services/training-report-export.service.ts');
for (const token of ['Resumen', 'Por programa', 'No asistieron', 'Sin resultado registrado', 'Tasa de asistencia', 'markCoverageRate', 'uniqueClients', 'uniqueDogs']) {
  if (!reportExport.includes(token)) throw new Error('Trainer hard-statistics export missing: ' + token);
}
const absenceSql = read('supabase/sql/ucapsa-staff-explicit-absences.sql');
for (const token of [
  'program_attendance_absences',
  'staff_mark_program_absence',
  'clear_staff_absence_on_attendance',
  'absent boolean',
]) {
  if (!absenceSql.includes(token)) throw new Error('Explicit attendance outcome SQL missing: ' + token);
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
  'trainer_create_ucapsa_exam_draft',
  'get_staff_dog_operational_profile',
  'get_staff_exam_drafts',
  'staff_publish_ucapsa_exam',
  'draft_ready_for_staff_publish',
]) {
  if (!trainerSqlAll.includes(token)) throw new Error('Trainer SQL boundary missing: ' + token);
}

if (/trainer_import_ucapsa_exam_results[\s\S]*admin_publish_ucapsa_exam_attempt/.test(trainerSqlAll)) {
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
  "const key = `${row.scheduleId}:${row.programCode}:${row.startTime}`",
]) {
  if (!adminHome.includes(token)) throw new Error('Admin tomorrow summary must preserve one shared Comandos schedule with level breakdown: ' + token);
}
if (adminHome.includes(":${row.programLevel}")) {
  throw new Error('Inicio Admin no puede convertir los niveles de Comandos en horarios separados.');
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
  "const key = `${schedule.id}:${code}:${String(schedule.start_time).slice(0, 5)}`",
  "if (code === 'comandos')",
  'current.levels.set(label, level)',
]) {
  if (!trainerSummary.includes(token)) throw new Error('Trainer summary notification missing: ' + token);
}
if (trainerSummary.includes(":${enrollment.program_level}")) {
  throw new Error('El resumen push no puede separar Comandos en horarios por nivel.');
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
  "supabase.rpc('staff_mark_program_absence'",
  "supabase.rpc('trainer_import_ucapsa_exam_results'",
  "supabase.rpc('trainer_create_ucapsa_exam_draft'",
  "supabase.rpc('get_staff_dog_operational_profile'",
  "supabase.rpc('get_staff_exam_drafts'",
  "supabase.rpc('staff_publish_ucapsa_exam'",
]) {
  if (!trainerService.includes(token)) throw new Error('Trainer app service boundary missing: ' + token);
}

for (const token of [
  "export type StaffWorkspaceMode = 'admin' | 'trainer'",
  'canSwitchStaffWorkspace',
  'readStaffWorkspaceMode',
  'writeStaffWorkspaceMode',
]) {
  if (!staffWorkspace.includes(token)) throw new Error('Staff workspace mode missing: ' + token);
}
for (const token of [
  "value === 'trainer' ? 'trainer' : 'admin'",
  'AsyncStorage.getItem',
  'AsyncStorage.setItem',
]) {
  if (!staffWorkspaceService.includes(token)) throw new Error('Staff workspace persistence missing: ' + token);
}
for (const token of ['Administración', 'Entrenamiento', '/trainer-home', '/admin-home']) {
  if (!staffSwitcher.includes(token)) throw new Error('Staff workspace switcher missing: ' + token);
}
for (const token of [
  'parseUcapsaExamDefinitionXlsx',
  'pickAndParseUcapsaExamDefinitionXlsx',
  'Puntos máximos',
]) {
  if (!examXlsx.includes(token)) throw new Error('Exam definition Excel parser missing: ' + token);
}

for (const token of [
  'function selectDate(nextDate: string)',
  'if (nextDate === dateKey)',
  'void load();',
  'onPress={() => selectDate(today)}',
  'onPress={() => selectDate(tomorrow)}',
]) {
  if (!trainerClasses.includes(token)) throw new Error('Roster day reselection must trigger a reload: ' + token);
}
if (trainerClasses.includes('setDateKey(today); setLoading(true)') || trainerClasses.includes('setDateKey(tomorrow); setLoading(true)')) {
  throw new Error('Roster day reselection spinner regression detected.');
}

if (!pkg.includes('"check:trainer-role"')) {
  throw new Error('npm verify does not include trainer role guard.');
}

// Regression: a normal Admin must not be able to grant/revoke Trainer with
// a direct profiles UPDATE. Superadmin retains authority; Admin can still
// handle ordinary client/member transitions.
const staffRoleHardening = read('supabase/sql/ucapsa-trainer-role-escalation-hardening.sql');
for (const token of [
  'CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_changes()',
  "OLD.role IN ('trainer', 'admin', 'super_admin')",
  "NEW.role IN ('trainer', 'admin', 'super_admin')",
  'AND NOT public.is_super_admin()',
  "RAISE EXCEPTION 'Solo super_admin puede modificar roles de personal.'",
]) {
  if (!staffRoleHardening.includes(token)) {
    throw new Error('Profile trigger allows staff-role escalation: ' + token);
  }
}
if (/NEW\.role IN \('admin', 'super_admin'\)/.test(staffRoleHardening)) {
  throw new Error('Trainer must not be omitted from privileged profile transitions.');
}

// Regression: staff report must expose user/dog identifiers from the CTE
// that supplies x.user_id and x.dog_id. SQL syntax checks alone missed this.
for (const path of [
  'supabase/sql/ucapsa-staff-explicit-absences.sql',
  'supabase/sql/ucapsa-staff-report-projection-hotfix.sql',
]) {
  const source = read(path);
  const report = source.split('create or replace function public.get_staff_training_report(')[1];
  const eligible = report?.split('eligible as (')[1]?.split('from dates dte')[0] ?? '';
  for (const field of ['e.id as enrollment_id', 'e.schedule_id', 'e.user_id', 'e.dog_id']) {
    if (!eligible.includes(field)) {
      throw new Error('Staff report eligible CTE omits ' + field + ' in ' + path);
    }
  }
  for (const field of ['x.user_id', 'x.dog_id']) {
    if (!report.includes(field)) throw new Error('Staff report result omits ' + field);
  }
}

// Statistics integrity: a zero denominator is undefined, not 0% attendance.
// An empty range can have 0% capture coverage only when eligible > 0.
for (const token of [
  "value === null ? 'Sin datos'",
  'attendanceRate: markedOutcomes > 0 ? attended / markedOutcomes : null',
  'markCoverageRate: rows.length > 0 ? markedOutcomes / rows.length : null',
  'confirmedAttendanceRate: confirmedMarked > 0 ? confirmedAttended / confirmedMarked : null',
  'Confirmados con asistencia registrada',
  'item.attended / (item.attended + item.absent) : null',
  'formatTrainingPercentage(item.attendanceRate)',
]) {
  if (!reportExport.includes(token)) throw new Error('Undefined attendance KPI still treated as 0%: ' + token);
}
for (const token of [
  'formatTrainingPercentage(stats.attendanceRate)',
  'formatTrainingPercentage(stats.markCoverageRate)',
]) {
  if (!report.includes(token)) throw new Error('Trainer report UI misrepresents unknown attendance: ' + token);
}
if (report.includes('(stats.attendanceRate * 100).toFixed(1)')) {
  throw new Error('Trainer attendance preview must not show false 0.0% for missing marks.');
}


for (const token of [
  "const raw = (drafts[item.id]?.points ?? '').trim();",
  'if (!raw) return false;',
  'Califica todos los ejercicios. Si corresponde cero puntos, escribe 0 explícitamente.',
]) {
  if (!examAttempt.includes(token)) {
    throw new Error('Trainer exam permits a blank grade to be submitted as zero: ' + token);
  }
}
if (examAttempt.includes("Number((drafts[item.id]?.points ?? '').replace(',', '.'))")) {
  throw new Error('Empty score is silently converted into zero in trainer exam.');
}


// Import batches must respect DB lifecycle draft -> validated -> committed.
// An import that skips validated fails at runtime even with a valid XLSX.
for (const path of [
  'supabase/sql/ucapsa-trainer-workspace.sql',
  'supabase/sql/ucapsa-trainer-exam-import-lifecycle-hotfix.sql',
]) {
  const source = read(path);
  const fn = source.split('create or replace function public.trainer_import_ucapsa_exam_results(')[1];
  if (!fn) throw new Error('Trainer Excel RPC missing from ' + path);
  const validated = fn.indexOf("status = 'validated'");
  const committed = fn.indexOf("status = 'committed'");
  if (validated < 0 || committed < validated) {
    throw new Error('Trainer Excel import skipped draft -> validated transition in ' + path);
  }
  if (!fn.includes('public.ucapsa_exam_import_snapshot(p_exam_id)')) {
    throw new Error('Trainer import validation lost exam snapshot in ' + path);
  }
}

console.log('UCAPSA trainer role, least privilege, exams, staff notes, reporting and next-day summary: PASS');
