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
const trainerDogScopeSql = read('supabase/sql/ucapsa-trainer-dog-access-scope.sql');
const recordedHistorySql = read('supabase/sql/ucapsa-staff-recorded-attendance-history.sql');
const trainerSqlAll = trainerSql + '\n' + trainerModeSql + '\n' + trainerDogScopeSql;
const adminMore = read('src/app/(tabs)/admin-more.tsx');
const rootLayout = read('src/app/_layout.tsx');
const examXlsx = read('src/services/ucapsa-exam-xlsx.ts');
const users = read('src/app/admin/users.tsx');
const adminHome = read('src/app/(tabs)/admin-home.tsx');
const notificationCard = read('src/components/domain/NotificationSettingsCard.tsx');
const notificationNav = read('src/hooks/useNotificationNavigation.ts');
const trainerSummary = read('supabase/functions/send-trainer-class-summary/index.ts');
const trainerCron = read('supabase/sql/ucapsa-trainer-class-summary-cron.sql');
const trainerLocks = read('supabase/sql/ucapsa-trainer-class-summary-notifications.sql');
const comandosScheduleSql = read('supabase/sql/ucapsa-comandos-single-schedule.sql');
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
  "where p.code = 'comandos'",
  'if v_count > 1 then',
  'create or replace function public.enforce_single_commands_schedule()',
  "v_program_code = 'comandos'",
  'pg_advisory_xact_lock(20261012, 318)',
  'ps.id <> new.id',
  'before insert or update of program_id',
  'execute function public.enforce_single_commands_schedule()',
]) {
  if (!comandosScheduleSql.includes(token)) {
    throw new Error('Comandos database invariant missing: ' + token);
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
  'Nuevo examen',
  'Crear manual',
  'Importar Excel',
  'addManualExamItem',
  'editManualExamItem',
  'removeManualExamItem',
  'chooseDraftInputMode',
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

// La definición de examen se crea desde una sola superficie de staff, con
// edición manual o Excel; Admin hereda exactamente el mismo servicio.
for (const token of [
  "useState<'manual' | 'excel'>('manual')",
  "setDraftItems((items) =>",
  'createTrainerExamDraft({',
  'items: draftItems,',
  'maxPoints <= 0',
  'maxPoints > 1000',
  'setEditingItemIndex(null)',
  'onPress={() => chooseDraftInputMode',
]) {
  if (!trainerExams.includes(token)) throw new Error('Editor manual/Excel de staff perdió una regla: ' + token);
}
if (!adminMore.includes("router.push('/trainer-exams'")) {
  throw new Error('Admin perdió la entrada al editor de exámenes compartido.');
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
  'create or replace function public.can_ucapsa_staff_access_dog(p_dog_id uuid)',
  'when public.is_ucapsa_admin() then true',
  "p.role::text = 'trainer'",
  "e.status in ('active', 'completed')",
  'not public.can_ucapsa_staff_access_dog(p_dog_id)',
  'and public.can_ucapsa_staff_access_dog(d.id)',
  'and public.can_ucapsa_staff_access_dog(a.dog_id)',
  'not public.can_ucapsa_staff_access_dog(v_attempt.dog_id)',
]) {
  if (!trainerDogScopeSql.includes(token)) {
    throw new Error('Trainer dog least-privilege scope missing: ' + token);
  }
}
for (const fn of [
  'get_staff_dog_notes',
  'staff_add_dog_note',
  'staff_update_dog_note',
  'staff_resolve_dog_note',
  'get_staff_dog_operational_profile',
  'get_trainer_exam_dogs',
  'trainer_create_ucapsa_exam_attempt',
  'get_trainer_exam_attempt',
  'trainer_upsert_ucapsa_exam_item_result',
  'trainer_review_ucapsa_exam_attempt',
]) {
  if (!trainerDogScopeSql.includes('create or replace function public.' + fn)) {
    throw new Error('Trainer dog scope no longer covers RPC: ' + fn);
  }
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
  "supabase.rpc('staff_mark_program_absence'",
  "supabase.rpc('trainer_import_ucapsa_exam_results'",
  "supabase.rpc('trainer_create_ucapsa_exam_draft'",
  "supabase.rpc('get_staff_dog_operational_profile'",
  "supabase.rpc('get_staff_exam_drafts'",
  "supabase.rpc('staff_publish_ucapsa_exam'",
]) {
  if (!trainerService.includes(token)) throw new Error('Trainer app service boundary missing: ' + token);
}

// La asistencia registrada es una consulta separada del roster esperado:
// nunca puede crear asistencias, cambiar estados o ampliar permisos a clientes.
for (const part of [
  'get_staff_recorded_attendance',
  'security definer',
  'if not public.is_ucapsa_staff() then',
  'from public.program_attendances a',
  'get_effective_program_schedule(',
  'from public, anon',
  'to authenticated, service_role',
  'p_end_date - p_start_date',
]) {
  if (!recordedHistorySql.includes(part)) throw new Error('Historial staff perdió control: ' + part);
}
if (/\b(insert|update|delete|truncate)\s+(into|public|from)/i.test(recordedHistorySql)) {
  throw new Error('La consulta histórica nunca debe mutar asistencias.');
}

// El rol del servidor gobierna la navegación; no hay un modo persistido ni
// un selector con el que Admin/Superadmin puedan simular otro rol.
for (const [name, source] of [
  ['root', rootLayout], ['tabs', tabs], ['admin home', adminHome],
  ['trainer home', trainerHome], ['trainer more', trainerMore],
]) {
  if (/useStaffWorkspace|StaffWorkspaceSwitcher|StaffWorkspaceProvider|staffWorkspaceMode/.test(source)) {
    throw new Error('Selector de modo de staff reintroducido en ' + name);
  }
}
for (const token of ['const trainerWorkspace = isTrainer;', 'const adminWorkspace = isAdmin;']) {
  if (!tabs.includes(token)) throw new Error('La navegación debe basarse exclusivamente en el rol: ' + token);
}
for (const target of ['/trainer-classes', '/trainer-exams', '/staff/training-report']) {
  if (!adminMore.includes(target)) throw new Error('Admin perdió una herramienta operativa: ' + target);
}
if (!adminMore.includes('/admin/restaurant')) {
  throw new Error('El acceso a Restaurante desapareció de Herramientas de Admin.');
}
if (!adminHome.includes("router.push('/admin/restaurant'") || !adminHome.includes('restaurantShortcut')) {
  throw new Error('Restaurante debe abrirse desde un único atajo compacto del encabezado.');
}
if (adminHome.includes('quickAccessRow') || adminHome.includes('<MenuRow')) {
  throw new Error('Inicio Admin no debe convertirse en menú de herramientas.');
}
if (!trainerHome.includes('if (isAdmin) return <Redirect href="/admin-home" />')) {
  throw new Error('Admin debe mantener su propio Inicio.');
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

for (const token of [
  "import { Calendar, type DateData } from 'react-native-calendars'",
  'onDayPress={(day: DateData) => selectDate(day.dateString)}',
  "setFocusedScheduleId('')",
  'setExpandedScheduleId(null)',
  'accessibilityState={{ expanded: expandedScheduleId === group.scheduleId }}',
  'expandedScheduleId === group.scheduleId ? group.rows.map',
  'const canMarkAttendance = dateKey === today',
  'loadRunRef.current += 1',
]) {
  if (!trainerClasses.includes(token)) throw new Error('Calendario/roster colapsado perdió una protección: ' + token);
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
