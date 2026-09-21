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

const policyStatements = anonHelperSql.match(/create\s+policy[\s\S]*?;/gi) ?? [];
const anonPolicyStatements = policyStatements
  .filter((statement) => /\bto\s+anon\b/i.test(statement))
  .join('\n');

if (/\b(?:get_my_role|has_active_membership|is_admin|is_feature_enabled|is_super_admin|is_ucapsa_admin)\s*\(/i.test(anonPolicyStatements)) {
  throw new Error('Anonymous RLS policy still calls a privileged helper.');
}


const sqlFiles = fs.readdirSync('supabase/sql')
  .filter((name) => name.endsWith('.sql'))
  .sort();

const adminRoleGuard = /\b(?:public\.)?(?:is_ucapsa_admin|is_admin|is_super_admin)\s*\(/i;
let adminFunctionDefinitions = 0;

for (const file of sqlFiles) {
  const text = fs.readFileSync(`supabase/sql/${file}`, 'utf8');
  const marker = /create\s+or\s+replace\s+function\s+public\.(admin_[a-z0-9_]+)\s*\(/gi;
  let match;

  while ((match = marker.exec(text)) !== null) {
    const functionName = match[1];
    const nextFunctionIndex = text.toLowerCase().indexOf('create or replace function public.', match.index + match[0].length);

    const asPattern = /\bas\s+(\$[a-z0-9_]*\$)/gi;
    asPattern.lastIndex = match.index;
    const asMatch = asPattern.exec(text);

    if (!asMatch || (nextFunctionIndex >= 0 && asMatch.index > nextFunctionIndex)) {
      throw new Error(`Could not parse Admin function body: ${file} -> ${functionName}`);
    }

    const tag = asMatch[1];
    const bodyEnd = text.indexOf(`${tag};`, asMatch.index + asMatch[0].length);
    if (bodyEnd < 0 || (nextFunctionIndex >= 0 && bodyEnd > nextFunctionIndex)) {
      throw new Error(`Admin function body is unterminated: ${file} -> ${functionName}`);
    }

    const block = text.slice(match.index, bodyEnd + tag.length + 1);
    adminFunctionDefinitions += 1;

    if (/security\s+definer/i.test(block) && !adminRoleGuard.test(block)) {
      throw new Error(
        `SECURITY DEFINER Admin function lacks an internal role guard: ${file} -> ${functionName}`,
      );
    }

    marker.lastIndex = bodyEnd + tag.length + 1;
  }
}

if (adminFunctionDefinitions === 0) {
  throw new Error('No versioned admin_* function definitions were found to audit.');
}

// Audit the entire client-exposed SECURITY DEFINER surface, not only admin_*.
// Supabase's advisor warns on every authenticated SECURITY DEFINER RPC; most are
// intentional, but any new one must prove its authorization boundary here.
const allSql = sqlFiles
  .map((file) => fs.readFileSync(`supabase/sql/${file}`, 'utf8'))
  .join('\n');

const clientGrantedNames = new Set();
const grantPattern = /grant\s+execute\s+on\s+function\s+public\.([a-z0-9_]+)\s*\([^;]*?\)\s+to\s+([^;]+);/gi;
let grantMatch;
while ((grantMatch = grantPattern.exec(allSql)) !== null) {
  const roles = grantMatch[2].toLowerCase();
  if (/\bauthenticated\b/.test(roles)) clientGrantedNames.add(grantMatch[1]);
}

const readHelperAllowlist = new Set([
  'get_effective_program_schedule',
  'get_effective_program_schedules',
  'get_ucapsa_competition_leaderboard',
  'is_feature_enabled',
  'program_schedule_occurs_on_date',
]);

const clientAdminName = /^(?:admin_|correct_|delete_|get_admin_|register_.*_admin$|rotate_attendance_qr_code$)/i;
const selfScopeGuard = /\bauth\.uid\s*\(/i;
let exposedDefinerDefinitions = 0;

for (const file of sqlFiles) {
  const text = fs.readFileSync(`supabase/sql/${file}`, 'utf8');
  const marker = /create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi;
  let match;

  while ((match = marker.exec(text)) !== null) {
    const functionName = match[1];
    const nextFunctionIndex = text.toLowerCase().indexOf(
      'create or replace function public.',
      match.index + match[0].length,
    );

    const asPattern = /\bas\s+(\$[a-z0-9_]*\$)/gi;
    asPattern.lastIndex = match.index;
    const asMatch = asPattern.exec(text);
    if (!asMatch || (nextFunctionIndex >= 0 && asMatch.index > nextFunctionIndex)) {
      marker.lastIndex = nextFunctionIndex >= 0 ? nextFunctionIndex : text.length;
      continue;
    }

    const tag = asMatch[1];
    const bodyEnd = text.indexOf(`${tag};`, asMatch.index + asMatch[0].length);
    if (bodyEnd < 0 || (nextFunctionIndex >= 0 && bodyEnd > nextFunctionIndex)) {
      throw new Error(`Function body is unterminated: ${file} -> ${functionName}`);
    }

    const block = text.slice(match.index, bodyEnd + tag.length + 1);
    marker.lastIndex = bodyEnd + tag.length + 1;

    if (!/security\s+definer/i.test(block) || !clientGrantedNames.has(functionName)) continue;
    exposedDefinerDefinitions += 1;

    if (clientAdminName.test(functionName)) {
      if (!adminRoleGuard.test(block)) {
        throw new Error(
          `Client-exposed Admin SECURITY DEFINER function lacks role guard: ${file} -> ${functionName}`,
        );
      }
      continue;
    }

    if (selfScopeGuard.test(block) || adminRoleGuard.test(block)) continue;
    if (readHelperAllowlist.has(functionName)) continue;

    const sameNameWrapper = new RegExp(
      'select\\s+\\*\\s+from\\s+public\\.' + functionName + '\\s*\\(',
      'i',
    );
    if (sameNameWrapper.test(block)) continue;

    throw new Error(
      `Client-exposed SECURITY DEFINER function lacks explicit auth scope or reviewed exception: ${file} -> ${functionName}`,
    );
  }
}

if (exposedDefinerDefinitions < 20) {
  throw new Error(
    `SECURITY DEFINER surface audit parsed too few exposed definitions (${exposedDefinerDefinitions}); parser/SQL drift likely.`,
  );
}

if (!pkg.includes('"check:security-definer"')) {
  throw new Error('npm verify does not include the SECURITY DEFINER hardening guard.');
}

console.log(
  `UCAPSA internal SECURITY DEFINER surface: PASS (${exposedDefinerDefinitions} client-exposed definitions reviewed).`,
);
