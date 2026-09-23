import fs from 'node:fs';

const legal = fs.readFileSync('src/constants/legal.ts', 'utf8');
const settings = fs.readFileSync('src/app/account-settings.tsx', 'utf8');
const privacyFunction = fs.readFileSync('supabase/functions/privacy-policy/index.ts', 'utf8');
const deletionPage = fs.readFileSync('supabase/functions/account-deletion-request/index.ts', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');
const apple = fs.readFileSync('docs/legal/APP_STORE_PRIVACY.md', 'utf8');
const google = fs.readFileSync('docs/legal/GOOGLE_PLAY_DATA_SAFETY.md', 'utf8');
const play = fs.readFileSync('docs/legal/GOOGLE_PLAY_SUBMISSION.md', 'utf8');
const continuity = fs.readFileSync('src/services/continuity-evidence.service.ts', 'utf8');
const notice = fs.readFileSync('docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md', 'utf8');
const migration = fs.readFileSync('supabase/sql/ucapsa-store-privacy-v1-1.sql', 'utf8');

for (const token of [
  'UCAPSA_PRIVACY_PUBLIC_URL',
  'UCAPSA_ACCOUNT_DELETION_PUBLIC_URL',
]) {
  if (!legal.includes(token)) throw new Error('Cross-store legal URL missing: ' + token);
}

if (!settings.includes('UCAPSA_ACCOUNT_DELETION_PUBLIC_URL')) {
  throw new Error('Account settings lost the public deletion resource.');
}

for (const token of [
  'Eliminar tu cuenta y datos',
  'ucapsa84@gmail.com',
  'Solicitud de eliminación de cuenta UCAPSA App',
  'privacy-policy',
]) {
  if (!deletionPage.includes(token)) throw new Error('External deletion page missing: ' + token);
}

if (!/\[functions\.account-deletion-request\][\s\S]*verify_jwt\s*=\s*false/.test(config)) {
  throw new Error('External deletion resource must be public.');
}

if (!privacyFunction.includes('account-deletion-request')) {
  throw new Error('Public privacy policy must prominently link account deletion.');
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

for (const token of [
  'targetSdkVersion 36',
  'App access',
  'Content rating',
  'Target audience',
  'AAB',
]) {
  if (!play.includes(token)) throw new Error('Google Play submission checklist missing: ' + token);
}

console.log('UCAPSA cross-store privacy readiness: PASS');
