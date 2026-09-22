import fs from 'node:fs';

const accessSql = fs.readFileSync('supabase/sql/ucapsa-member-dog-training-access.sql', 'utf8');
const qrSql = fs.readFileSync('supabase/sql/ucapsa-unified-member-qr-attendance.sql', 'utf8');
const decisions = fs.readFileSync('src/services/admin-training-decisions.service.ts', 'utf8');
const membershipAdmin = fs.readFileSync('src/app/admin/customer-membership.tsx', 'utf8');
const attendanceUi = fs.readFileSync('src/app/attendance.tsx', 'utf8');
const homeCards = fs.readFileSync('src/screens/home/HomeCards.tsx', 'utf8');
const home = fs.readFileSync('src/screens/home/HomeExperienceScreen.tsx', 'utf8');
const dog = fs.readFileSync('src/app/(tabs)/dog.tsx', 'utf8');
const classDetail = fs.readFileSync('src/app/client/class-detail.tsx', 'utf8');
const credential = fs.readFileSync('src/components/domain/ProgramCredentialCard.tsx', 'utf8');
const nextSession = fs.readFileSync('src/services/program-next-session.service.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  "access_mode text not null default 'card'",
  "check (access_mode in ('card', 'membership'))",
  'create table if not exists public.membership_dog_access',
  'program_enrollments_one_active_membership_stage_per_dog_idx',
  'admin_set_membership_dog_coverage',
  'admin_set_member_dog_training_stage',
  "v_level := 'principiante'",
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

for (const token of [
  'rank(right) - rank(left)',
  "program.programLevel === 'avanzado'",
  "left.accessMode === 'membership'",
]) {
  if (!home.includes(token)) {
    throw new Error('Home highest-stage selection contract missing: ' + token);
  }
}

if (!pkg.includes('"check:member-training-access"')) {
  throw new Error('npm verify does not include member training access guard.');
}

console.log('UCAPSA member per-dog unlimited training + QR/progression contract: PASS');
