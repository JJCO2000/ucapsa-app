import fs from 'node:fs';

const accessSql = fs.readFileSync('supabase/sql/ucapsa-member-dog-training-access.sql', 'utf8');
const qrSql = fs.readFileSync('supabase/sql/ucapsa-unified-member-qr-attendance.sql', 'utf8');
const decisions = fs.readFileSync('src/services/admin-training-decisions.service.ts', 'utf8');
const membershipAdmin = fs.readFileSync('src/app/admin/customer-membership.tsx', 'utf8');
const attendanceUi = fs.readFileSync('src/app/attendance.tsx', 'utf8');
const homeCards = fs.readFileSync('src/screens/home/HomeCards.tsx', 'utf8');
const dog = fs.readFileSync('src/app/(tabs)/dog.tsx', 'utf8');
const classDetail = fs.readFileSync('src/app/client/class-detail.tsx', 'utf8');
const credential = fs.readFileSync('src/components/domain/ProgramCredentialCard.tsx', 'utf8');
const nextSession = fs.readFileSync('src/services/program-next-session.service.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

if (accessSql.includes("v_level := 'principiante'")) {
  throw new Error('Member access must not invent Comandos Principiante without training history.');
}

for (const token of [
  "access_mode text not null default 'card'",
  "check (access_mode in ('card', 'membership'))",
  'create table if not exists public.membership_dog_access',
  'program_enrollments_one_active_membership_stage_per_dog_idx',
  'admin_set_membership_dog_coverage',
  'admin_set_member_dog_training_stage',
  'No hay evidencia suficiente para inferir programa o nivel.',
  'return null;',
  "where m.status = 'active'",
  'join public.dogs d',
  'a.is_covered = true',
]) {
  if (!accessSql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Member dog access SQL contract missing: ' + token);
  }
}

for (const token of [
  'drop trigger if exists trg_ucapsa_unlock_next_program_stage',
  "v_membership_qr := v_qr.program_code = 'member'",
  "coalesce(v_enrollment.access_mode, 'card') = 'membership'",
  'membership_dog_access',
  'dog_not_covered',
  "mv.visit_date = v_visit_date",
  "q.program_code in ('member', 'puppy', 'comandos')",
]) {
  if (!qrSql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Unified member QR contract missing: ' + token);
  }
}

if (!decisions.includes("(row.enrollment.access_mode ?? 'card') === 'card'")) {
  throw new Error('Member unlimited enrollments can leak into the six-class Admin decision inbox.');
}

for (const token of [
  'setMembershipDogCoverageAdmin',
  'setMemberDogTrainingStageAdmin',
  'Todos entran por defecto',
  'Cambiar nivel',
  'Asignar nivel',
  'setStageProgram(null)',
  'setStageLevel(null)',
  'No hay una etapa respaldada por historial',
]) {
  if (!membershipAdmin.includes(token)) {
    throw new Error('Admin membership dog/level controls missing: ' + token);
  }
}

for (const token of [
  "type ChoiceMode = 'select_member_dog'",
  '¿Qué perro asistió?',
  'Socio · acceso ilimitado',
]) {
  if (!attendanceUi.includes(token)) {
    throw new Error('Member attendance multi-dog selection contract missing: ' + token);
  }
}
if (attendanceUi.includes('memberGroupFor(') || attendanceUi.includes('memberGroupRepresentatives(')) {
  throw new Error('Member QR must never auto-count every dog in a same-level group.');
}

for (const [name, text, tokens] of [
  ['Home card', homeCards, ["program?.accessMode === 'membership'", 'Sin límite de clases']],
  ['Dog screen', dog, ["item.enrollment.access_mode === 'membership'", 'acceso ilimitado', 'workspace-premium']],
  ['Class detail', classDetail, ["item?.enrollment.access_mode === 'membership'", 'Acceso ilimitado por membresía']],
  ['Credential', credential, ["item.enrollment.access_mode === 'membership'", 'Socio · ilimitado']],
  ['Next session', nextSession, ["item.enrollment.access_mode === 'membership'", 'unlimitedMembershipAccess']],
]) {
  for (const token of tokens) {
    if (!text.includes(token)) throw new Error(name + ' lost member-access behavior: ' + token);
  }
}

if (!pkg.includes('"check:member-training-access"')) {
  throw new Error('npm verify does not include member training access guard.');
}


// El número de tarjeta física puede ser desconocido en registros históricos.
// Nunca inferir inexistencia de la tarjeta ni invalidar una inscripción Puppy.
const puppyAdmin=fs.readFileSync('src/app/admin/customer-class.tsx','utf8');
const enrollmentService=fs.readFileSync('src/services/program-enrollments.service.ts','utf8');
if(!puppyAdmin.includes("physical_card_number?.trim() || 'No registrada'") ||
   !puppyAdmin.includes('label="Referencia Puppy"') ||
   !puppyAdmin.includes("row.program.code === 'puppy'")) {
  throw new Error('El número físico opcional no debe implicar tarjeta inexistente.');
}
if(!enrollmentService.includes('physicalCardNumber?: string | null;') ||
   !enrollmentService.includes('physical_card_number: input.physicalCardNumber?.trim() || null') ||
   !enrollmentService.includes("if ('physicalCardNumber' in input) {")) {
  throw new Error('El servicio debe conservar registros sin número y permitir su edición.');
}

// La referencia es exclusivamente un campo físico de Puppy. El programa
// Comandos se autoriza por inscripción, no por un número de tarjeta inventado.
// No borrar los números antiguos almacenados en otros expedientes.
const adminClasses = fs.readFileSync('src/app/admin/classes.tsx', 'utf8');
for (const contract of [
  "physicalCardNumber: selectedProgram?.code === 'puppy' ? form.physicalCardNumber : null",
  "physicalCardNumber: nextProgram?.code === 'puppy' ? current.physicalCardNumber : ''",
  "selectedProgram?.code === 'puppy' ? (",
  'Referencia de tarjeta física Puppy (si se conoce)',
  "row.program.code === 'puppy'",
]) {
  if (!adminClasses.includes(contract)) {
    throw new Error('Comandos no debe depender de referencia física Puppy: ' + contract);
  }
}
if (adminClasses.includes('physicalCardNumber: form.physicalCardNumber,')) {
  throw new Error('Comandos no puede guardar número físico reutilizado de Puppy.');
}

// La evaluación de Puppy/Comandos debe reconocer el total canónico calculado
// en servidor, incluidas asistencias históricas auditadas, no solo fechas QR.
const decisionService = fs.readFileSync('src/services/admin-training-decisions.service.ts', 'utf8');
const historicDecisionMigration = fs.readFileSync(
  'supabase/migrations/20261019080000_preregistration_historical_training_decisions.sql',
  'utf8',
);
if (!decisionService.includes('row.enrollment.attendances_count >= required') ||
    !decisionService.includes('attendanceCount: row.enrollment.attendances_count') ||
    decisionService.includes('row.attendances.length >= required')) {
  throw new Error('Evaluación administrativa ignoraría historial sin fechas.');
}
for (const token of [
  'public.is_ucapsa_admin()',
  'public.program_attendance_historical_evidence h',
  'sum(h.quantity)::integer',
  'v_attendance_count < greatest(1',
  'training_card.decision',
]) {
  if (!historicDecisionMigration.includes(token)) {
    throw new Error('La decisión histórica perdió una condición esencial: ' + token);
  }
}

// El frontend puede entrar a main ANTES de que las nuevas tablas existan.
// Nunca exponer la pantalla ni llamar RPC sin habilitación expresa.
const preregistrationFeature = fs.readFileSync('src/constants/preregistrationFeature.ts','utf8');
const preregistrationService = fs.readFileSync('src/services/dog-preregistration.service.ts','utf8');
const preregistrationScreen = fs.readFileSync('src/app/admin/preregister-dog.tsx','utf8');
const preregistrationUsers = fs.readFileSync('src/app/admin/users.tsx','utf8');
const preregistrationSession = fs.readFileSync('src/hooks/useSession.tsx','utf8');
const preregistrationRoster = fs.readFileSync('src/services/preregistration-roster.service.ts','utf8');
const trainerClasses = fs.readFileSync('src/app/(tabs)/trainer-classes.tsx','utf8');
for (const [label, ok] of [
  ['flag apagado salvo true expreso',preregistrationFeature.includes("=== 'true'")],
  ['RPC bloqueada',preregistrationService.includes("if (!preregistrationEnabled) throw new Error")],
  ['pantalla bloqueada',preregistrationScreen.includes('!isAdmin || !preregistrationEnabled')],
  ['directorio bloqueado',preregistrationUsers.includes('{preregistrationEnabled ? (')],
  ['vinculación Auth bloqueada',preregistrationSession.includes('if (!preregistrationEnabled) return;')],
  ['vinculación exige credencial verificada',preregistrationSession.includes('if (!emailConfirmed) return;')],
  ['roster provisional apagado',preregistrationRoster.includes('if (!preregistrationEnabled) return [];')],
  ['mismo horario de roster',trainerClasses.includes('row.scheduleId === group.scheduleId && row.programCode === group.programCode')],
  ['sin número en Comandos',preregistrationService.includes("input.programCode === 'puppy' ? input.physicalCardNumber.trim() : ''")],
]) {
  if (!ok) throw new Error('Regresión de preinscripción: ' + label);
}

// Expedientes de preinscripción: lectura solo Admin y SSOT de membresía/nivel.
const preregReadSql = fs.readFileSync('supabase/migrations/20261019170000_admin_preregistration_records.sql','utf8');
const preregReadService = fs.readFileSync('src/services/preregistration-admin.service.ts','utf8');

const preregListScreen = fs.readFileSync('src/app/admin/preregistrations.tsx','utf8');
const preregDetailScreen = fs.readFileSync('src/app/admin/preregistration.tsx','utf8');
const officialClientScreen = fs.readFileSync('src/app/admin/customer.tsx','utf8');
const officialClassScreen = fs.readFileSync('src/app/admin/customer-class.tsx','utf8');
const officialAttendanceScreen = fs.readFileSync('src/app/admin/customer-attendance.tsx','utf8');
const officialUserDirectory = fs.readFileSync('src/app/admin/users.tsx','utf8');
for (const [label, yes] of [
  ['RPC exige Admin autenticado',preregReadSql.includes('auth.uid() is null or not public.is_ucapsa_admin()')],
  ['RPC revoca acceso a público y anon',preregReadSql.includes('from public, anon;')],
  ['RPC no concede datos directos',!preregReadSql.includes('grant select on ucapsa_intake')],
  ['Socio viene de membresía real',preregReadSql.includes('from public.memberships m')],
  ['Histórico se suma de evidencia privada',preregReadSql.includes('from ucapsa_intake.attendance_evidence h')],
  ['Cliente muestra contador canónico',officialClientScreen.includes('sum + item.enrollment.attendances_count')],
  ['Clase muestra contador canónico',officialClassScreen.includes('row.enrollment.attendances_count')],
  ['Detalle de asistencias muestra contador canónico',officialAttendanceScreen.includes('selectedEnrollment.enrollment.attendances_count')],
  ['Comandos no guarda referencia Puppy',officialClassScreen.includes("row.program.code === 'puppy' ? { physicalCardNumber: cardNumber }")],
  ['Directorio enlaza al listado tras activar el RPC',officialUserDirectory.includes("preregistrationDirectoryEnabled ? '/admin/preregistrations' : '/admin/preregister-dog'")],
  ['Alta previa sigue operativa',officialUserDirectory.includes('{preregistrationEnabled ? (')],
  ['Nuevo directorio apagado hasta despliegue',preregistrationFeature.includes("EXPO_PUBLIC_UCAPSA_PREREGISTRATION_DIRECTORY_ENABLED === 'true'")],
  ['Lista cerrada sin nueva RPC',preregListScreen.includes('!isAdmin || !preregistrationDirectoryEnabled')],
  ['Ficha cerrada sin nueva RPC',preregDetailScreen.includes('!isAdmin || !preregistrationDirectoryEnabled')],
  ['Lista abre fichas',preregListScreen.includes("router.push(('/admin/preregistration?intakeProgramId='")],
  ['Solo Admin consulta fichas',preregDetailScreen.includes("!isAdmin || !preregistrationDirectoryEnabled")],
  ['Lectura no crea membresía',!preregReadService.includes("from('memberships').insert")],
]) {
  if (!yes) throw new Error('Contrato de ficha de preinscripción incumplido: ' + label);
}

console.log('UCAPSA member per-dog unlimited training + QR/progression contract: PASS');
