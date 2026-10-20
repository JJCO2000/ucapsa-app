import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const formats = read('src/constants/ucapsaFormats.ts');
const appearance = read('src/hooks/useMemberAppearance.tsx');
for (const theme of ['classic', 'red', 'blue', 'green']) {
  assert.ok(formats.includes(`key: '${theme}'`), `Missing Socio palette ${theme}`);
}
assert.ok(formats.includes('getMemberThemeFormat(input.memberTheme ?? DEFAULT_MEMBER_THEME)'),
  'Member theme must not influence admin or trainer permissions.');
assert.ok(appearance.includes('@ucapsa/member-appearance/') && appearance.includes('userId'),
  'A visual preference must be scoped to the local user.');
assert.ok(appearance.includes('AsyncStorage.setItem') && appearance.includes('AsyncStorage.getItem'),
  'The visual preference must persist and restore.');
assert.ok(read('src/app/_layout.tsx').includes('<MemberAppearanceProvider>'),
  'Appearance provider is missing from the authenticated app.');
const settings = read('src/app/account-settings.tsx');
assert.ok(settings.includes('title="Colores de socio"') && settings.includes("section === 'appearance' && premium"),
  'Only Socios may access the appearance settings.');
for (const path of [
  'src/app/(tabs)/_layout.tsx', 'src/screens/home/HomeExperienceScreen.tsx',
  'src/app/(tabs)/profile.tsx', 'src/app/client/membership.tsx',
  'src/app/account-settings.tsx',
]) {
  assert.ok(read(path).includes('memberTheme'), `Theme not used by ${path}`);
}
assert.ok(read('src/components/domain/MemberCredentialCard.tsx').includes('format: UcapsaFormat'),
  'Membership card must consume the selected colors.');
const auth = read('src/services/auth.service.ts');
assert.ok(auth.includes('export const AUTH_PASSWORD_MIN_LENGTH = 6;'),
  'Requested six-character password policy must be retained.');
assert.ok(auth.includes('password.length < AUTH_PASSWORD_MIN_LENGTH'),
  'Password policy must be checked in the auth service.');
console.log('UCAPSA member appearance and six-character auth boundary: PASS');
