import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (path) => fs.readFileSync(path, 'utf8');

const options = read('src/constants/dogAvatar.ts');
const profile = read('src/app/client/dog-profile.tsx');
const avatar = read('src/components/domain/DogAvatar.tsx');
const service = read('src/services/dogs.service.ts');
const owned = read('supabase/migrations/20261022024837_owned_avatar_preferences_rpc.sql');
const defaults = read('supabase/migrations/20261022061111_optional_avatar_ink_argument_for_simple_picker.sql');
const invoker = read('supabase/migrations/20261022025241_restore_competition_leaderboard_security_invoker.sql');
const types = read('src/types/database.generated.ts');

// El producto ofrece únicamente avatar actual + paleta de fondo, sin editor por emoji.
assert.ok(options.includes("kind: 'emoji' | 'icon'"));
assert.ok(options.includes('DOG_AVATAR_COLORS'));
assert.ok(options.includes("'dog_face'"));
assert.ok(options.includes("'dog_play'"));
assert.ok(profile.includes('Cambiar avatar'));
assert.ok(profile.includes('Elegir color del avatar'));
assert.ok(profile.includes('setAvatarExpanded((open) => !open)'));
assert.ok(profile.includes('setAvatarColorsExpanded((open) => !open)'));
assert.ok(profile.includes('void persistAvatar()'));
assert.ok(!profile.includes('avatarInkExpanded'));
assert.ok(!profile.includes('Color del dibujo'));
assert.ok(!avatar.includes('vectorEmoji'), 'No sustituir emojis por otros dibujos.');
assert.ok(avatar.includes('dogAvatarForeground(normalizedColor)'));

// El servidor verifica auth.uid() y la propiedad; no habilitar RLS global.
assert.ok(service.includes("rpc('set_my_dog_avatar_preferences'"));
assert.ok(service.includes('p_avatar_key: avatarKey'));
assert.ok(service.includes('p_avatar_color: avatarColor'));
assert.ok(!service.includes("p_avatar_foreground_color:"));
assert.ok(owned.includes('d.id=p_dog_id AND d.user_id=v_user AND d.is_active=true'));
assert.ok(owned.includes('REVOKE ALL ON FUNCTION public.set_my_dog_avatar_preferences'));
assert.ok(defaults.includes('p_avatar_foreground_color text DEFAULT NULL'));
assert.ok(invoker.includes('security_invoker = true'));
assert.ok(types.includes('set_my_dog_avatar_preferences: {'));
console.log('UCAPSA avatar simple, persistencia y permisos: PASS');
