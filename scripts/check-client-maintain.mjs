import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-client-maintain-privilege.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'revoke maintain',
  'on all tables in schema public',
  'from anon, authenticated',
  'alter default privileges for role postgres in schema public',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Client MAINTAIN hardening missing: ' + token);
  }
}

for (const privilege of ['select', 'insert', 'update', 'delete']) {
  const revokePattern = new RegExp('revoke[^;]*\\b' + privilege + '\\b', 'i');
  if (revokePattern.test(sql)) {
    throw new Error('Client MAINTAIN hardening must not revoke CRUD privilege: ' + privilege);
  }
}

if (/alter\s+policy|drop\s+policy|create\s+policy/i.test(sql)) {
  throw new Error('Client MAINTAIN hardening must not change RLS semantics.');
}

if (/alter\s+default\s+privileges\s+for\s+role\s+supabase_admin/i.test(sql)) {
  throw new Error('Managed Supabase migrations cannot alter supabase_admin defaults.');
}

if (!pkg.includes('"check:client-maintain"')) {
  throw new Error('npm verify does not include the client MAINTAIN guard.');
}

console.log('UCAPSA client MAINTAIN privilege hardening: PASS');
