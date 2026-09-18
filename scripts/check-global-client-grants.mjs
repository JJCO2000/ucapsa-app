import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-global-client-grant-hardening.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  'revoke truncate, references, trigger',
  'on all tables in schema public',
  'from anon, authenticated',
  'alter default privileges for role postgres in schema public',
  'cannot change supabase_admin-owned default privileges',
];

for (const token of required) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Global client grant hardening missing: ' + token);
  }
}

for (const privilege of ['select', 'insert', 'update', 'delete']) {
  const revokePattern = new RegExp('revoke[^;]*\\b' + privilege + '\\b', 'i');
  if (revokePattern.test(sql)) {
    throw new Error('Global client grant hardening must not revoke CRUD privilege: ' + privilege);
  }
}

if (/alter\s+default\s+privileges\s+for\s+role\s+supabase_admin/i.test(sql)) {
  throw new Error('Managed Supabase migrations run as postgres and cannot alter supabase_admin defaults.');
}

if (/alter\s+policy|drop\s+policy|create\s+policy/i.test(sql)) {
  throw new Error('Global client grant hardening must not change RLS semantics.');
}

if (!pkg.includes('"check:global-client-grants"')) {
  throw new Error('npm verify does not include the global client grant guard.');
}

console.log('UCAPSA global client table privilege hardening: PASS');
