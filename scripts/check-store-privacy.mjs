import fs from 'node:fs';

const legal = fs.readFileSync('src/constants/legal.ts', 'utf8');
const settings = fs.readFileSync('src/app/account-settings.tsx', 'utf8');
const privacyFunction = fs.readFileSync('supabase/functions/privacy-policy/index.ts', 'utf8');
const deletionFunction = fs.readFileSync('supabase/functions/account-deletion-request/index.ts', 'utf8');
const deletionPage = fs.readFileSync('docs/legal/ELIMINAR_CUENTA_UCAPSA_APP.md', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');
const apple = fs.readFileSync('docs/legal/APP_STORE_PRIVACY.md', 'utf8');
const google = fs.readFileSync('docs/legal/GOOGLE_PLAY_DATA_SAFETY.md', 'utf8');
const play = fs.readFileSync('docs/legal/GOOGLE_PLAY_SUBMISSION.md', 'utf8');
const continuity = fs.readFileSync('src/services/continuity-evidence.service.ts', 'utf8');
const notice = fs.readFileSync('docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md', 'utf8');
const migration = fs.readFileSync('supabase/sql/ucapsa-store-privacy-v1-1.sql', 'utf8');
const hostingFix = fs.readFileSync('supabase/sql/ucapsa-public-legal-url-fix.sql', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

for (const token of [
  "UCAPSA_TERMS_VERSION = '1.1'",
  'UCAPSA_PRIVACY_PUBLIC_URL',
  'UCAPSA_ACCOUNT_DELETION_PUBLIC_URL',
]) {
  if (!legal.includes(token)) throw new Error('Cross-store legal URL missing: ' + token);
}

if (!settings.includes('UCAPSA_ACCOUNT_DELETION_PUBLIC_URL')) {
  throw new Error('Account settings lost the public deletion resource.');
}

for (const token of [
  'Eliminar cuenta y datos',
  'ucapsa84@gmail.com',
  'Solicitud de eliminación de cuenta UCAPSA App',
  'AVISO_PRIVACIDAD_UCAPSA_APP.md',
]) {
  if (!deletionPage.includes(token)) throw new Error('External deletion page missing: ' + token);
}

for (const [name, text, target] of [
  ['privacy redirect', privacyFunction, 'AVISO_PRIVACIDAD_UCAPSA_APP.md'],
  ['deletion redirect', deletionFunction, 'ELIMINAR_CUENTA_UCAPSA_APP.md'],
]) {
  if (!text.includes('status: 302') || !text.includes('Location: TARGET_URL') || !text.includes(target)) {
    throw new Error(name + ' must redirect to a browser-safe rendered document.');
  }
}

if (!/\[functions\.account-deletion-request\][\s\S]*verify_jwt\s*=\s*false/.test(config)) {
  throw new Error('External deletion resource must be public.');
}

for (const text of [legal, apple, google, play, notice]) {
  if (text.includes('hrfecmviyiluubymsoeq.supabase.co/functions/v1/')) {
    throw new Error('Store-facing legal documentation still points to non-rendering Supabase HTML.');
  }
}

for (const token of [
  'AVISO_PRIVACIDAD_UCAPSA_APP.md',
  'ELIMINAR_CUENTA_UCAPSA_APP.md',
  'Legacy Supabase store-facing legal URL remains',
]) {
  if (!hostingFix.includes(token)) throw new Error('Legal hosting migration missing: ' + token);
}

if (!continuity.includes('recordValueExposure')) {
  throw new Error('Expected internal app-interaction analytics disappeared; re-audit store declarations.');
}

for (const token of [
  'Analítica interna de continuidad',
  'account-deletion-request',
  'Versión 1.1 App Stores',
]) {
  if (!notice.includes(token)) throw new Error('Privacy notice v1.1 missing: ' + token);
}

for (const token of [
  "1.1-appstores-2026-09-22",
  'analítica interna de uso y continuidad',
  'account-deletion-request',
]) {
  if (!migration.includes(token)) throw new Error('Cross-store privacy migration missing: ' + token);
}

for (const token of ['Product Interaction', 'Analytics', 'Crash Data']) {
  if (!apple.includes(token)) throw new Error('Apple privacy declaration missing: ' + token);
}

for (const token of [
  'Interacciones con la aplicación',
  'Analíticas',
  'Registros de fallos',
  'Historial de compras',
  'IDs de dispositivo o de otro tipo',
]) {
  if (!google.includes(token)) throw new Error('Google Data Safety declaration missing: ' + token);
}

if (!String(pkg.dependencies?.expo ?? '').startsWith('~57.')) {
  throw new Error('Google Play target API contract expects Expo SDK 57 / API 36.');
}
if (!pkg.dependencies?.['expo-updates']) {
  throw new Error('expo-updates disappeared; re-audit Crash Data declarations.');
}
for (const forbidden of ['expo-location', 'react-native-google-mobile-ads', '@react-native-firebase/analytics']) {
  if (pkg.dependencies?.[forbidden]) throw new Error('New store-sensitive dependency requires privacy re-audit: ' + forbidden);
}
for (const permission of [
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]) {
  if (!(app.expo?.android?.blockedPermissions ?? []).includes(permission)) {
    throw new Error('Expected blocked Android permission disappeared: ' + permission);
  }
}
if (!String(app.expo?.plugins ?? '').includes('expo-camera')) {
  throw new Error('Camera configuration disappeared; re-audit QR permission disclosure.');
}

for (const token of [
  'targetSdkVersion 36',
  'App access',
  'Content rating',
  'Target audience',
  'AAB',
  'Play App Signing',
  '16 KB',
]) {
  if (!play.includes(token)) throw new Error('Google Play submission checklist missing: ' + token);
}

console.log('UCAPSA cross-store privacy readiness: PASS');
