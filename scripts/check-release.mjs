import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function pluginConfig(plugins, name) {
  const entry = plugins.find((item) => (Array.isArray(item) ? item[0] : item) === name);
  if (!entry) return null;
  return Array.isArray(entry) ? (entry[1] ?? {}) : {};
}

function walk(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full));
    else output.push(full);
  }
  return output;
}

const pkg = readJson('package.json');
const app = readJson('app.json');
const eas = readJson('eas.json');

const brandSource = fs.readFileSync(path.join(root, 'src/constants/brand.ts'), 'utf8');
const brandRedMatch = brandSource.match(/\bred:\s*['"](#[0-9A-Fa-f]{6})['"]/);
if (!brandRedMatch) fail('No pude resolver ucapsaBrand.colors.red desde brand.ts.');
const brandRed = brandRedMatch?.[1]?.toUpperCase() ?? '';

const dependencies = pkg.dependencies ?? {};
const overrides = pkg.overrides ?? {};

const expoVersion = String(dependencies.expo ?? '');
if (!/[~^]?57\./.test(expoVersion)) {
  fail(`Expo debe estar en SDK 57: ${dependencies.expo ?? 'missing'}`);
}

function parseVersion(value) {
  const match = String(value ?? '').match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function atLeast(value, target) {
  const current = parseVersion(value);
  const wanted = parseVersion(target);
  if (!current || !wanted) return false;
  for (let i = 0; i < 3; i += 1) {
    if (current[i] > wanted[i]) return true;
    if (current[i] < wanted[i]) return false;
  }
  return true;
}

if (!atLeast(dependencies['react-native'], '0.86.2')) {
  fail(`React Native debe ser 0.86.2 o posterior para evitar la regresion Hermes V1: ${dependencies['react-native'] ?? 'missing'}`);
}

const expectedOverrides = {
  'brace-expansion': '5.0.9',
  'js-yaml': '4.3.1',
  'postcss': '8.5.23',
  'nanoid@>=4.0.0 <=5.1.10': '5.1.16',
};
for (const [name, version] of Object.entries(expectedOverrides)) {
  if (overrides[name] !== version) {
    fail(`Override de seguridad incorrecto para ${name}: ${overrides[name] ?? 'missing'}; esperado ${version}`);
  }
}
if (Object.prototype.hasOwnProperty.call(overrides, 'nanoid@<=3.3.11')) {
  fail('No debe existir el override nanoid@<=3.3.11: con npm 10 rompe npm ci; la seguridad 3.x se valida contra package-lock.json en check-nanoid-security.mjs.');
}
if (Object.prototype.hasOwnProperty.call(overrides, 'nanoid')) {
  fail('No debe existir un override global simple de nanoid: romperia innecesariamente la separacion 3.x/5.x.');
}

const expo = app.expo ?? {};
const android = expo.android ?? {};
const blocked = new Set(android.blockedPermissions ?? []);
for (const permission of [
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]) {
  if (!blocked.has(permission)) fail(`Falta bloquear ${permission}`);
}
if (android.allowBackup !== false) {
  fail('android.allowBackup debe ser false para no respaldar automaticamente datos/sesion de la app.');
}
if (!android.package || android.package === 'com.placeholder.appid') {
  fail('Falta android.package de produccion.');
}

const camera = pluginConfig(expo.plugins ?? [], 'expo-camera');
if (!camera) {
  fail('Falta config plugin expo-camera.');
} else {
  if (camera.recordAudioAndroid !== false) fail('expo-camera recordAudioAndroid debe ser false: UCAPSA solo escanea QR.');
  if (camera.barcodeScannerEnabled !== true) fail('expo-camera barcodeScannerEnabled debe ser true.');
}

const notifications = pluginConfig(expo.plugins ?? [], 'expo-notifications');
if (!notifications) {
  fail('Falta config plugin expo-notifications.');
} else {
  if (notifications.defaultChannel !== 'default') fail('expo-notifications.defaultChannel debe ser default.');
  if (String(notifications.color ?? '').toUpperCase() !== brandRed) fail('El color de notificación no coincide con ucapsaBrand.colors.red.');
}

const splash = pluginConfig(expo.plugins ?? [], 'expo-splash-screen');
if (!splash) {
  fail('Falta config plugin expo-splash-screen.');
} else if (String(splash.backgroundColor ?? '').toUpperCase() !== brandRed) {
  fail('El splash no coincide con ucapsaBrand.colors.red.');
}

if (eas?.build?.production?.autoIncrement !== true) {
  fail('EAS production.autoIncrement debe seguir activo.');
}
if (eas?.cli?.appVersionSource !== 'remote') {
  fail('EAS appVersionSource debe seguir en remote.');
}
for (const environment of ['development', 'preview', 'production']) {
  if (eas?.build?.[environment]?.environment !== environment) {
    fail(`EAS build.${environment}.environment debe ser ${environment}.`);
  }
}

const srcDir = path.join(root, 'src');
const sourceFiles = walk(srcDir).filter((file) => /\.(tsx?|jsx?)$/.test(file));
const rootIconImport = /from\s+['"]@expo\/vector-icons['"]/;
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (rootIconImport.test(text)) {
    fail(`Import raiz @expo/vector-icons todavia presente: ${path.relative(root, file)}`);
  }
}

const notificationService = fs.readFileSync(path.join(root, 'src/services/admin-notifications.service.ts'), 'utf8');
if (/console\.log\s*\(/.test(notificationService)) {
  fail('admin-notifications.service.ts sigue escribiendo detalles de Edge Function con console.log.');
}

if (!expo?.ios?.bundleIdentifier) {
  notes.push('iOS: no hay bundleIdentifier definitivo. No bloquea el release Android del Paso 10.');
}

if (failures.length) {
  console.error('RELEASE CHECK FAIL:');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log('RELEASE CHECK OK: SDK 57/RN 0.86.2+, permisos Android, notificaciones, dependencias, iconos y EAS revisados.');
for (const note of notes) console.log(`NOTE: ${note}`);
