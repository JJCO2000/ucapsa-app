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
// GitHub Pages publica HTML desde main/docs y reutiliza los textos legales
// sin duplicarlos en archivos que puedan quedar desactualizados.
const pagesConfig = fs.readFileSync('docs/_config.yml', 'utf8');
const pagesLayout = fs.readFileSync('docs/_layouts/legal.html', 'utf8');
const pagesIndex = fs.readFileSync('docs/index.html', 'utf8');
const pagesPrivacy = fs.readFileSync('docs/legal/privacidad.html', 'utf8');
const pagesDelete = fs.readFileSync('docs/legal/eliminar-cuenta.html', 'utf8');
const pagesCss = fs.readFileSync('docs/assets/legal.css', 'utf8');
const pagesHost = 'https://jjco2000.github.io/ucapsa-app';

// Google Play requires a public, non-editable privacy-policy web page,
// not a GitHub source/editor view. Both app and store declarations share Pages.
for (const [fileName, source] of [
  ['src/constants/legal.ts', legal],
  ['docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md', notice],
  ['docs/legal/APP_STORE_PRIVACY.md', apple],
  ['docs/legal/GOOGLE_PLAY_DATA_SAFETY.md', google],
  ['docs/legal/GOOGLE_PLAY_SUBMISSION.md', play],
]) {
  if (!source.includes(pagesHost + '/privacidad/')) {
    throw new Error(fileName + ': URL of the rendered privacy policy was lost');
  }
  if (source.includes('https://github.com/JJCO2000/ucapsa-app/blob/main/docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md')) {
    throw new Error(fileName + ': GitHub markdown must not be used as the Play privacy URL');
  }
}
for (const [fileName, source] of [
  ['src/constants/legal.ts', legal],
  ['docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md', notice],
  ['docs/legal/APP_STORE_PRIVACY.md', apple],
  ['docs/legal/GOOGLE_PLAY_DATA_SAFETY.md', google],
  ['docs/legal/GOOGLE_PLAY_SUBMISSION.md', play],
]) {
  if (!source.includes(pagesHost + '/eliminar-cuenta/')) {
    throw new Error(fileName + ': rendered account deletion URL is missing');
  }
}

if (!pagesConfig.includes('baseurl: "/ucapsa-app"') || !pagesConfig.includes('url: "https://jjco2000.github.io"')) {
  throw new Error('GitHub Pages perdido: host o baseurl');
}
for (const [page, source, expectedPath] of [
  [pagesPrivacy, 'AVISO_PRIVACIDAD_UCAPSA_APP.md', '/privacidad/'],
  [pagesDelete, 'ELIMINAR_CUENTA_UCAPSA_APP.md', '/eliminar-cuenta/'],
]) {
  if (!page.includes('{% include_relative ' + source + ' %}') ||
      !page.includes('permalink: ' + expectedPath) ||
      !page.includes('| markdownify')) {
    throw new Error('Página legal debe renderizar el documento canónico como HTML: ' + expectedPath);
  }
}
if (!pagesPrivacy.includes(pagesHost + '/eliminar-cuenta/') ||
    !pagesDelete.includes(pagesHost + '/privacidad/')) {
  throw new Error('La web legal debe enlazar correctamente ambas páginas públicas.');
}
for (const token of ['<html lang="es-MX">', '{{ content }}', 'privacy', 'eliminar-cuenta', 'viewport']) {
  // "privacy" está en la meta descripción de la página principal, no en inglés.
  if (token !== 'privacy' && !pagesLayout.includes(token)) {
    throw new Error('Layout web legal incompleto: ' + token);
  }
}
if (!pagesIndex.includes('/privacidad/') || !pagesIndex.includes('/eliminar-cuenta/') ||
    !pagesCss.includes('@media(max-width:700px)')) {
  throw new Error('Sitio legal carece de entrada pública, navegación o formato móvil.');
}


for (const token of [
  "UCAPSA_TERMS_VERSION = '1.2'",
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
  pagesHost + '/eliminar-cuenta/',
  'Versión 1.3 App Stores',
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

for (const token of ['Product Interaction', 'Analytics', 'Crash Data', 'Photos or Videos']) {
  if (!apple.includes(token)) throw new Error('Apple privacy declaration missing: ' + token);
}

for (const token of [
  'Interacciones con la aplicación',
  'Analíticas',
  'Registros de fallos',
  'Historial de compras',
  'IDs de dispositivo o de otro tipo',
  'Fotos y vídeos',
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
