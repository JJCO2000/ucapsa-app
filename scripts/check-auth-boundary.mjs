import fs from 'node:fs';

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
  'AUTH_PASSWORD_MIN_LENGTH = 12',
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

if (!login.includes('signInWithEmail')) {
  throw new Error('Login is not using the canonical auth boundary.');
}

if (!forgot.includes('resetPasswordForEmail')) {
  throw new Error('Forgot-password is not using the canonical auth boundary.');
}

if (!/resetPasswordForEmail[\s\S]{0,260}redirectTo:\s*PASSWORD_RECOVERY_REDIRECT_URL/.test(service)) {
  throw new Error('Password recovery email lost its mobile redirect target.');
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
