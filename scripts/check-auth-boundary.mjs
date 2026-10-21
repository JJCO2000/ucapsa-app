import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

const service = fs.readFileSync('src/services/auth.service.ts', 'utf8');
const register = fs.readFileSync('src/app/auth/register.tsx', 'utf8');
const login = fs.readFileSync('src/app/auth/login.tsx', 'utf8');
const forgot = fs.readFileSync('src/app/auth/forgot-password.tsx', 'utf8');
const updatePassword = fs.readFileSync('src/app/auth/update-password.tsx', 'utf8');
const appJson = fs.readFileSync('app.json', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const screens = [
  ['register', register],
  ['login', login],
  ['forgot-password', forgot],
  ['update-password', updatePassword],
];

for (const [name, text] of screens) {
  if (/lib\/supabase/.test(text) || /supabase\.auth\./.test(text)) {
    throw new Error(`Auth screen ${name} bypasses auth.service.ts.`);
  }
}

for (const token of [
  'AUTH_PASSWORD_MIN_LENGTH = 6',
  'normalizeAuthEmail',
  'validateNewPassword',
  'signInWithEmail',
  'signUpWithEmail',
  'resetPasswordForEmail',
  'PASSWORD_RECOVERY_REDIRECT_URL',
  'establishPasswordRecoverySession',
  'updateCurrentUserPassword',
  'supabase.auth.setSession',
  'supabase.auth.exchangeCodeForSession',
]) {
  if (!service.includes(token)) {
    throw new Error('Auth service contract missing: ' + token);
  }
}

if (!register.includes('signUpWithEmail') || !register.includes('validateNewPassword')) {
  throw new Error('Register is not using the canonical auth boundary and password policy.');
}

// Ambas formas de ingreso deben permanecer en auth.service, no realizar
// operaciones de Supabase directamente desde la pantalla.
if (!login.includes('signInWithVerifiedContact') ||
    !service.includes('export async function signInWithVerifiedContact') ||
    !service.includes('return signInWithEmail(value, password)') ||
    !service.includes('supabase.auth.signInWithPassword({ phone, password })')) {
  throw new Error('Login must use the canonical email/phone password auth boundary.');
}

if (!forgot.includes('resetPasswordForEmail')) {
  throw new Error('Forgot-password is not using the canonical auth boundary.');
}

// Recovery links must preserve Android/iOS deep links while using the
// browser's current HTTPS origin for web. Never accept a URL from user input.
if (!/resetPasswordForEmail[\s\S]{0,260}redirectTo:\s*passwordRecoveryRedirectUrl\(\)/.test(service)) {
  throw new Error('Password recovery email must use the platform-specific redirect.');
}
if (!service.includes("if (Platform.OS !== 'web') return PASSWORD_RECOVERY_REDIRECT_URL;") ||
    !service.includes("new URL('/auth/update-password', window.location.origin)")) {
  throw new Error('Password recovery lost native deep-link or same-origin web redirect.');
}

const recoveryStart = service.indexOf('export async function establishPasswordRecoverySession');
const recoveryEnd = service.indexOf('export async function updateCurrentUserPassword', recoveryStart);
const recoveryContract = recoveryStart >= 0 && recoveryEnd > recoveryStart
  ? service.slice(recoveryStart, recoveryEnd)
  : '';
if (!recoveryContract || /auth\.getSession\(/.test(recoveryContract)) {
  throw new Error('Password recovery must not fall back to an unrelated existing session.');
}
if (/useSession\(|Boolean\(user\)|if \(user\)/.test(updatePassword)) {
  throw new Error('Update-password route must not trust a normal signed-in session as recovery proof.');
}

for (const token of [
  'Linking.useLinkingURL()',
  'establishPasswordRecoverySession',
  'updateCurrentUserPassword',
  'validateNewPassword',
]) {
  if (!updatePassword.includes(token)) {
    throw new Error('Update-password route lost recovery contract: ' + token);
  }
}

if (!/"scheme"\s*:\s*"ucapsaapp"/.test(appJson)) {
  throw new Error('App scheme no longer matches the password recovery redirect.');
}

if (!pkg.includes('"check:auth-boundary"')) {
  throw new Error('npm verify does not include the auth boundary guard.');
}

console.log('UCAPSA auth boundary + client password policy: PASS');

// Mexican national phone login guard: normalization never verifies ownership.
const phoneModule = { exports: {} };
const phoneCode = ts.transpileModule(
  fs.readFileSync('src/utils/phone-contact.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
vm.runInNewContext(phoneCode, { module: phoneModule, exports: phoneModule.exports });
const normalizeContactPhone = phoneModule.exports.normalizeContactPhone;
for (const [raw, expected] of [
  ['5535100214', '+525535100214'],
  ['55 35 100 214', '+525535100214'],
  ['5535, 100, 214', '+525535100214'],
  ['52 55 35 100 214', '+525535100214'],
  ['+52 (55) 3510-0214', '+525535100214'],
  ['+34911222333', '+34911222333'],
]) assert.equal(normalizeContactPhone(raw), expected);
for (const invalid of ['123', 'abc', '+0012345678', '12345678901234567']) {
  assert.throws(() => normalizeContactPhone(invalid));
}
assert.ok(service.includes('normalizeContactPhone(value)'), 'Phone login must use the normalizer.');
assert.ok(service.includes('supabase.auth.signInWithPassword({ phone, password })'),
  'Phone login must still use Supabase Auth, not profile lookup.');
const staged = fs.readFileSync('src/services/dog-preregistration.service.ts', 'utf8');
assert.ok(staged.includes('normalizeContactPhone(input.ownerPhone)'),
  'Admin preregistration must persist canonical phone contact.');
const accountProfileService = fs.readFileSync('src/services/profiles.service.ts', 'utf8');
assert.ok(accountProfileService.includes("|| !data.user?.email_confirmed_at"),
  'Adding email to Auth must not report ready-for-login before confirmation.');
const settings = fs.readFileSync('src/app/account-settings.tsx', 'utf8');
assert.ok(settings.includes("setEmail(user?.email ?? profile?.email ?? '')"),
  'Auth email must take priority over possibly stale profile email.');
assert.ok(settings.includes('Correo de acceso (Supabase)')
  && settings.includes('Celular principal')
  && settings.includes('no habilita el acceso por ese correo'),
  'Contact email and phone must never be advertised as login credentials.');
const adminForm = fs.readFileSync('src/app/admin/preregister-dog.tsx', 'utf8');
assert.ok(adminForm.includes("Platform.OS === 'web'") && adminForm.includes('setSubmissionNotice')
  && adminForm.includes('clearCardForm()') && adminForm.includes('Otro registro'),
  'Web preregistration needs visible success/error and fast next-entry flow.');
// The canonical contact format is shared without treating profile phone as Auth proof.
assert.ok(accountProfileService.includes('normalizeContactPhone(input.phone)'),
  'Profile writes must share preregistration and Auth phone normalization.');
assert.ok(accountProfileService.includes('verifiedPhone && normalizedPhone !== verifiedPhone'),
  'Verified login phone must not silently diverge from client contact.');
const phoneVerification = fs.readFileSync('src/services/phone-verification.service.ts', 'utf8');
assert.ok(phoneVerification.includes('return normalizeContactPhone(input)'),
  'SMS confirmation must reuse the canonical phone normalizer.');
assert.ok(phoneVerification.includes('await updateMyProfile({ phone: verifiedPhone });'),
  'Auth-verified phone must be synced to the same principal profile contact.');
assert.ok(settings.includes('sameContactPhone(mainPhone, user.phone)')
  && !settings.includes('Teléfono de acceso verificado en Supabase'),
  'Account settings must display one primary mobile with verification status.');
const sameContactPhone = phoneModule.exports.sameContactPhone;
assert.equal(sameContactPhone('55 35 100 214', '+525535100214'), true);
assert.equal(sameContactPhone('5535100214', '+525535100215'), false);
assert.equal(sameContactPhone('abc', '+525535100214'), false);
assert.equal(sameContactPhone(null, '+525535100214'), false);
console.log('UCAPSA auth Mexican national phone formatting and credential separation: PASS');


// Password policy is enforced at the service boundary as well as the UI.
// Existing sessions/password logins are deliberately unaffected.
const signupSegment = service.split('export async function signUpWithEmail(')[1]
  ?.split('export async function resetPasswordForEmail(')[0] ?? '';
assert.ok(signupSegment.includes('const passwordError = validateNewPassword(password);')
  && signupSegment.includes('if (passwordError) throw new Error(passwordError);')
  && signupSegment.indexOf('validateNewPassword(password)') < signupSegment.indexOf('supabase.auth.signUp('),
  'Sign-up must enforce the 6-character policy in the canonical auth service');
assert.ok(service.includes('export const AUTH_PASSWORD_MIN_LENGTH = 6;'),
  'The password policy must reflect the six-character decision');
console.log('UCAPSA new-password policy 6 characters and service-boundary validation: PASS');
