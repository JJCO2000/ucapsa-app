import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-security-definer-hardening.sql', 'utf8');
const anonRpcSql = fs.readFileSync('supabase/sql/ucapsa-anon-rpc-hardening.sql', 'utf8');
const anonHelperSql = fs.readFileSync('supabase/sql/ucapsa-anon-helper-policy-hardening.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  'revoke all on function public.enforce_lifetime_membership() from public, anon, authenticated;',
  'revoke all on function public.ensure_program_enrollment_dog_link() from public, anon, authenticated;',
  'revoke all on function public.handle_new_user() from public, anon, authenticated;',
  'revoke all on function public.rls_auto_enable() from public, anon, authenticated;',
  'revoke all on function public.trg_ucapsa_unlock_next_comandos_level() from public, anon, authenticated;',
  'revoke all on function public.validate_payment_obligation_owner() from public, anon, authenticated;',
  'revoke all on function public.ucapsa_unlock_next_comandos_level(uuid) from public, anon, authenticated;',
  'grant execute on function public.ucapsa_unlock_next_comandos_level(uuid) to service_role;',
];

for (const token of required) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('SECURITY DEFINER hardening contract missing: ' + token);
  }
}

const anonRpcRequired = [
  'public.get_effective_program_schedule(uuid, date)',
  'public.program_schedule_occurs_on_date(uuid, date)',
  'public.register_program_attendance_from_qr(text, uuid, boolean, uuid, timestamptz)',
  'public.register_program_attendance_from_qr(text, uuid, boolean)',
  'public.register_program_attendance_from_qr(text, uuid)',
  'public.register_member_visit_from_qr(text, uuid, timestamptz)',
  'public.register_member_visit_from_qr(text, uuid)',
  'public.register_member_visit_from_qr(text)',
  'public.rotate_attendance_qr_code(text)',
];

for (const signature of anonRpcRequired) {
  const revoke = ('revoke all on function ' + signature + ' from public, anon;').toLowerCase();
  const grant = ('grant execute on function ' + signature + ' to authenticated, service_role;').toLowerCase();
  if (!anonRpcSql.toLowerCase().includes(revoke)) {
    throw new Error('Anonymous SECURITY DEFINER RPC is not closed: ' + signature);
  }
  if (!anonRpcSql.toLowerCase().includes(grant)) {
    throw new Error('Authenticated/service_role access is not explicit: ' + signature);
  }
}

const anonHelperRequired = [
  'public.get_my_role()',
  'public.has_active_membership()',
  'public.is_admin()',
  'public.is_feature_enabled(text)',
  'public.is_super_admin()',
  'public.is_ucapsa_admin()',
];

for (const signature of anonHelperRequired) {
  const revoke = ('revoke all on function ' + signature + '\n  from public, anon;').toLowerCase();
  const grant = ('grant execute on function ' + signature + '\n  to authenticated, service_role;').toLowerCase();
  if (!anonHelperSql.toLowerCase().includes(revoke)) {
    throw new Error('Anonymous SECURITY DEFINER helper is not closed: ' + signature);
  }
  if (!anonHelperSql.toLowerCase().includes(grant)) {
    throw new Error('Authenticated/service_role helper access is not explicit: ' + signature);
  }
}

for (const policy of [
  'achievement_definitions_anon_select_active',
  'announcements_anon_select_public',
  'events_anon_select_public',
  'privacy_notices_anon_read_published',
  'achievement_definitions_authenticated_select',
  'announcements_authenticated_select_by_audience',
  'events_authenticated_select_by_audience',
  'privacy_notices_authenticated_read_published_or_superadmin',
]) {
  if (!anonHelperSql.includes(`"${policy}"`)) {
    throw new Error('Anon/authenticated RLS split missing policy: ' + policy);
  }
}

const anonPolicyStatements = [...anonHelperSql.matchAll(/create\s+policy[\s\S]*?\bto\s+anon\b[\s\S]*?;/gi)]
  .map((match) => match[0])
  .join('\n');

if (/\b(?:get_my_role|has_active_membership|is_admin|is_feature_enabled|is_super_admin|is_ucapsa_admin)\s*\(/i.test(anonPolicyStatements)) {
  throw new Error('Anonymous RLS policy still calls a privileged helper.');
}

if (!pkg.includes('"check:security-definer"')) {
  throw new Error('npm verify does not include the SECURITY DEFINER hardening guard.');
}

console.log('UCAPSA internal SECURITY DEFINER surface: PASS');
