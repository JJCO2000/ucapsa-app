import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-dog-profile-integrity-hardening.sql', 'utf8');
const dogsService = fs.readFileSync('src/services/dogs.service.ts', 'utf8');
const profilesService = fs.readFileSync('src/services/profiles.service.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'dogs_name_max_length',
  'char_length(btrim(name)) <= 80',
  'dogs_name_no_control_chars',
  "name !~ '[[:cntrl:]]'",
  'dogs_active_user_normalized_name_uidx',
  'on public.dogs (user_id, lower(btrim(name)))',
  'where is_active = true',
]) {
  if (!sql.includes(token)) {
    throw new Error('Dog data invariant missing: ' + token);
  }
}

for (const token of [
  'create or replace function public.sync_program_enrollment_dog_name()',
  'update public.program_enrollments',
  'where dog_id = new.id',
  'update public.profiles',
  "lower(btrim(coalesce(dog_name, ''))) = lower(btrim(old.name))",
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Dog rename compatibility contract missing: ' + token);
  }
}

for (const token of [
  'create or replace function public.prevent_unauthorized_dog_identity_changes()',
  'old.id is distinct from new.id',
  'old.user_id is distinct from new.user_id',
  'prevent_unauthorized_dog_identity_changes_trigger',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Dog identity immutability contract missing: ' + token);
  }
}

for (const token of [
  'create or replace function public.prevent_unauthorized_profile_changes()',
  'old.id is distinct from new.id',
  'old.user_id is distinct from new.user_id',
  'old.created_at is distinct from new.created_at',
  'old.deletion_requested_at is distinct from new.deletion_requested_at',
  'old.deletion_request_reason is distinct from new.deletion_request_reason',
  'old.email is distinct from new.email and not public.is_admin()',
  'old.role is distinct from new.role',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Profile mutation protection missing: ' + token);
  }
}

if (!/updateMyDogProfile[\s\S]{0,1800}\.from\('dogs'\)[\s\S]{0,1200}\.update\(payload\)/.test(dogsService)) {
  throw new Error('Dog profile editor changed write path; re-audit rename synchronization.');
}

if (/deletion_requested_at|deletion_request_reason|\brole\s*:/.test(
  profilesService.replace(/export type ProfileUpdateInput[\s\S]*?};/, ''),
)) {
  throw new Error('profiles.service.ts writes protected profile workflow fields directly.');
}

if (!pkg.includes('"check:dog-profile-integrity"')) {
  throw new Error('npm verify does not include dog/profile integrity guard.');
}

console.log('UCAPSA dog/profile identity, naming and legacy-field integrity: PASS');
