import fs from 'node:fs';

const service = fs.readFileSync('src/services/auth.service.ts', 'utf8');
const register = fs.readFileSync('src/app/auth/register.tsx', 'utf8');
const login = fs.readFileSync('src/app/auth/login.tsx', 'utf8');
const forgot = fs.readFileSync('src/app/auth/forgot-password.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const screens = [
  ['register', register],
  ['login', login],
  ['forgot-password', forgot],
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

if (!pkg.includes('"check:auth-boundary"')) {
  throw new Error('npm verify does not include the auth boundary guard.');
}

console.log('UCAPSA auth boundary + client password policy: PASS');
