import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-profile-dog-integrity-hardening.sql', 'utf8');
const dogHistorySql = fs.readFileSync('supabase/sql/ucapsa-dog-identity-history-hardening.sql', 'utf8');
const dogs = fs.readFileSync('src/services/dogs.service.ts', 'utf8');
const accountDeletion = fs.readFileSync('src/services/account-deletion.service.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'dogs_name_length_check',
  'dogs_name_no_control_chars_check',
  'dogs_user_active_normalized_name_unique_idx',
  'revoke insert on table public.dogs from authenticated',
  'create or replace function public.admin_create_basic_dog',
  "p.role in ('client', 'member')",
  "length(v_name) > 80",
  "v_name ~ '[[:cntrl:]]'",
  'create or replace function public.prevent_unauthorized_profile_changes',
  'old.id is distinct from new.id',
  'old.user_id is distinct from new.user_id',
  'old.created_at is distinct from new.created_at',
  'old.deletion_requested_at is distinct from new.deletion_requested_at',
  'old.deletion_request_reason is distinct from new.deletion_request_reason',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Profile/dog integrity contract missing: ' + token);
  }
}

if (!/group by user_id, lower\(btrim\(name\)\)[\s\S]{0,120}having count\(\*\) > 1/i.test(sql)) {
  throw new Error('Dog hardening does not preflight duplicate active normalized names.');
}

if (!/create unique index[\s\S]*user_id, lower\(btrim\(name\)\)[\s\S]*where is_active = true/i.test(sql)) {
  throw new Error('Dog-name uniqueness is not enforced at the database boundary.');
}

for (const token of [
  'create or replace function public.sync_program_enrollment_dog_name()',
  'update public.program_enrollments',
  'where dog_id = new.id',
  'update public.profiles',
  "lower(btrim(coalesce(dog_name, ''))) = lower(btrim(old.name))",
  'create or replace function public.prevent_unauthorized_dog_identity_changes()',
  'old.id is distinct from new.id',
  'old.user_id is distinct from new.user_id',
  'prevent_unauthorized_dog_identity_changes_trigger',
]) {
  if (!dogHistorySql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Dog identity/history follow-up missing: ' + token);
  }
}

if (!/admin_create_basic_dog[\s\S]{0,1800}public\.is_admin\(\)/i.test(sql)) {
  throw new Error('Admin dog creation lost the admin authorization check.');
}

for (const token of [
  "supabase.rpc('create_my_basic_dog'",
  "supabase.rpc('rename_my_basic_dog'",
  "supabase.rpc('admin_create_basic_dog'",
]) {
  if (!dogs.includes(token)) {
    throw new Error('Dog service bypassed canonical RPC: ' + token);
  }
}

if (!accountDeletion.includes("supabase.rpc('request_my_account_deletion'")) {
  throw new Error('Account deletion no longer uses its canonical ledger RPC.');
}

if (!pkg.includes('"check:identity-integrity"')) {
  throw new Error('npm verify does not include the profile/dog integrity guard.');
}

console.log('UCAPSA profile and dog integrity boundaries: PASS');
