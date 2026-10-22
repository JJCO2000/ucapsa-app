import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (path) => fs.readFileSync(path, 'utf8');

const migration = read('supabase/migrations/20261022023507_dog_avatar_foreground_and_leaderboard.sql');
const service = read('src/services/dogs.service.ts');
const avatar = read('src/components/domain/DogAvatar.tsx');
const constants = read('src/constants/dogAvatar.ts');
const profile = read('src/app/client/dog-profile.tsx');
const podium = read('src/components/domain/CompetitionPodium.tsx');
const ranking = read('src/app/client/competition-ranking.tsx');
const generated = read('src/types/database.generated.ts');

for (const token of [
  'ADD COLUMN IF NOT EXISTS avatar_foreground_color text NULL',
  'CHECK (', 'CREATE OR REPLACE VIEW public.ucapsa_competition_leaderboard',
  'd.avatar_foreground_color AS dog_avatar_foreground_color',
  'GRANT UPDATE (avatar_foreground_color) ON public.dogs TO authenticated',
  'coalesce(r.command_attendances_count,0::bigint) DESC',
  'coalesce(r.exam_points,0::numeric) DESC', 'r.dog_id',
]) assert.ok(migration.includes(token), 'Falta contrato SQL ' + token);
for (const token of [
  "select('id,avatar_foreground_color')", 'getForegroundsForDogs',
  '.update({ avatar_key: avatarKey, avatar_color: avatarColor, avatar_foreground_color: foreground })',
  'normalizeDogAvatarForegroundColor(data.avatar_foreground_color)',
]) assert.ok(service.includes(token), 'Falta persistencia ' + token);
for (const token of [
  'isAccessibleDogAvatarForeground','DOG_AVATAR_FOREGROUND_COLORS',
  'availableDogAvatarForegrounds','>= 3',
]) assert.ok(constants.includes(token), 'Falta contraste ' + token);
for (const token of [
  'option.kind === \'emoji\' && !vector','vectorEmoji',
  'avatarForegroundColor','isAccessibleDogAvatarForeground'
]) assert.ok(avatar.includes(token), 'Falta render tintable ' + token);
for (const token of [
  'Color del dibujo','avatarInkExpanded','setAvatarInk',
  'requested.ink','updated.ink = null',
  'availableDogAvatarForegrounds(avatarColor)',
]) assert.ok(profile.includes(token), 'Falta editor ' + token);
assert.ok(podium.includes('row.dog_avatar_foreground_color'));
assert.ok(ranking.includes('row.dog_avatar_foreground_color'));
assert.ok(ranking.includes('dog.avatar_foreground_color'));
assert.ok(generated.includes('dog_avatar_foreground_color: string | null'));
assert.ok(generated.includes('avatar_foreground_color: string | null'));
console.log('Color de dibujo y fondo: SSOT + contraste + preservación de ranking PASS');
