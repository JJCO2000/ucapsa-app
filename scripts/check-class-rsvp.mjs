import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const sql = read('supabase/sql/ucapsa-class-rsvp.sql');
const service = read('src/services/class-rsvp.service.ts');
const home = read('src/screens/home/HomeExperienceScreen.tsx');
const cards = read('src/screens/home/HomeCards.tsx');
const adminHome = read('src/app/(tabs)/admin-home.tsx');
const reminder = read('supabase/functions/send-class-reminders/index.ts');
const navigation = read('src/hooks/useNotificationNavigation.ts');
const pkg = read('package.json');

for (const token of [
  'program_class_rsvps',
  'unique (enrollment_id, class_date)',
  "response = any (array['yes'::text, 'no'::text])",
  'get_effective_program_schedule(v_enrollment.schedule_id, p_class_date)',
  'program_class_cancellations',
  'restored_at is null',
  "coalesce(v_enrollment.access_mode, 'card') <> 'membership'",
  'get_admin_class_rsvp_summary',
  'is_ucapsa_admin()',
  'no_response_count',
]) {
  if (!sql.includes(token)) throw new Error('Class RSVP SQL contract missing: ' + token);
}

// PostgreSQL treats RETURNS TABLE output names (enrollment_id, class_date)
// as PL/pgSQL variables. An inferred ON CONFLICT column list raises 42702.
// Named constraint resolution is unambiguous for both first insert and upsert.
const hotfix = read('supabase/sql/ucapsa-class-rsvp-conflict-hotfix.sql');
for (const [source, label] of [[sql, 'base'], [hotfix, 'hotfix']]) {
  if (!source.includes('on conflict on constraint program_class_rsvps_enrollment_date_unique do update')) {
    throw new Error('RSVP upsert can fail with SQLSTATE 42702 (' + label + ').');
  }
  if (/on conflict\\s*\\(\\s*enrollment_id\\s*,\\s*class_date\\s*\\)/i.test(source)) {
    throw new Error('Ambiguous RSVP inferred ON CONFLICT columns remain (' + label + ').');
  }
}

if (/insert\s+into\s+public\.program_attendances/i.test(sql)) {
  throw new Error('RSVP must never create real attendance rows.');
}

for (const token of [
  "supabase.rpc('get_my_class_rsvp'",
  "supabase.rpc('set_my_class_rsvp'",
  "supabase.rpc('get_admin_class_rsvp_summary'",
  'tomorrowDateKey',
]) {
  if (!service.includes(token)) throw new Error('Class RSVP service contract missing: ' + token);
}

for (const token of [
  'classIsTomorrow',
  'getMyClassRsvp',
  'setMyClassRsvp',
  'ClassRsvpPrompt',
]) {
  if (!home.includes(token)) throw new Error('Home RSVP flow missing: ' + token);
}

for (const token of [
  'Voy a asistir',
  'No podré ir',
  'Asistencia confirmada',
]) {
  if (!cards.includes(token)) throw new Error('Client RSVP action missing: ' + token);
}

for (const token of [
  'Asistencia esperada',
  'confirmedCount',
  'eligibleCount',
  'declinedCount',
  'noResponseCount',
  'a las {item.startTime} confirmados',
]) {
  if (!adminHome.includes(token)) throw new Error('Admin tomorrow summary missing: ' + token);
}

if (!reminder.includes('confirma si vas a asistir') && !reminder.includes('confirma tu asistencia')) {
  throw new Error('Class reminder no longer prompts RSVP.');
}
if (!navigation.includes("if (source === 'class_reminder') return '/home';")) {
  throw new Error('Class reminder must open Home where RSVP is visible.');
}
if (!pkg.includes('"check:class-rsvp"')) {
  throw new Error('npm verify does not include class RSVP guard.');
}

console.log('UCAPSA class RSVP + tomorrow capacity: PASS');
