import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-security-definer-hardening.sql', 'utf8');
const anonRpcSql = fs.readFileSync('supabase/sql/ucapsa-anon-rpc-hardening.sql', 'utf8');
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

if (!pkg.includes('"check:security-definer"')) {
  throw new Error('npm verify does not include the SECURITY DEFINER hardening guard.');
}

console.log('UCAPSA internal SECURITY DEFINER surface: PASS');
