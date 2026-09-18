import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-security-definer-hardening.sql', 'utf8');
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

if (!pkg.includes('"check:security-definer"')) {
  throw new Error('npm verify does not include the SECURITY DEFINER hardening guard.');
}

console.log('UCAPSA internal SECURITY DEFINER surface: PASS');
