import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta la pantalla esperada: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

function expectLink(journey, source, pattern, targetFile, label) {
  const sourceText = read(source);
  if (!pattern.test(sourceText)) failures.push(`${journey}: ${label} no navega al siguiente nivel esperado.`);
  read(targetFile);
}

function expectParam(journey, file, param) {
  const text = read(file);
  if (!/useLocalSearchParams/.test(text) || !new RegExp(`\\b${param}\\b`).test(text)) {
    failures.push(`${journey}: ${file} no consume el parámetro ${param}.`);
  }
}

// 1) Inicio -> ficha de clase -> acción Registrar asistencia.
expectLink(
  'Clases',
  'src/screens/home/HomeExperienceScreen.tsx',
  /\/client\/class-detail\?enrollmentId=/,
  'src/app/client/class-detail.tsx',
  'Inicio -> detalle de clase',
);
expectParam('Clases', 'src/app/client/class-detail.tsx', 'enrollmentId');
expectLink(
  'Clases',
  'src/app/client/class-detail.tsx',
  /router\.push\('\/attendance'/,
  'src/app/attendance.tsx',
  'detalle de clase -> registrar asistencia',
);

// 2) Inicio -> Racha y práctica -> historial -> práctica concreta.
expectLink(
  'Práctica',
  'src/screens/home/HomeExperienceScreen.tsx',
  /\/client\/practice-activity/,
  'src/app/client/practice-activity.tsx',
  'Inicio -> Racha y práctica',
);
expectLink(
  'Práctica',
  'src/app/client/practice-activity.tsx',
  /\/client\/practice-history/,
  'src/app/client/practice-history.tsx',
  'Racha y práctica -> historial',
);
expectLink(
  'Práctica',
  'src/app/client/practice-history.tsx',
  /\/client\/practice-detail\?practiceId=/,
  'src/app/client/practice-detail.tsx',
  'historial -> detalle de práctica',
);
expectParam('Práctica', 'src/app/client/practice-detail.tsx', 'practiceId');

// 3) Inicio -> Ajustes -> ficha de perfil / configuración de notificaciones.
expectLink(
  'Cuenta',
  'src/screens/home/HomeExperienceScreen.tsx',
  /\/account-settings/,
  'src/app/account-settings.tsx',
  'Inicio -> Ajustes',
);
const accountSettings = read('src/app/account-settings.tsx');
if (!/openSection\('profile'\)/.test(accountSettings)) failures.push('Cuenta: Ajustes perdió la entrada a Mis datos.');
if (!/openSection\('notifications'\)/.test(accountSettings)) failures.push('Cuenta: Ajustes perdió la entrada a Notificaciones.');
if (!/useLocalSearchParams/.test(accountSettings) || !/section/.test(accountSettings)) failures.push('Cuenta: Ajustes dejó de resolver la sección solicitada.');

// 4) Ajustes -> Mi perro -> editar perro / abrir clase histórica.
expectLink(
  'Mi perro',
  'src/app/account-settings.tsx',
  /router\.push\('\/dog'/,
  'src/app/(tabs)/dog.tsx',
  'Ajustes -> Mi perro',
);
expectLink(
  'Mi perro',
  'src/app/(tabs)/dog.tsx',
  /\/client\/dog-profile\?dogId=/,
  'src/app/client/dog-profile.tsx',
  'Mi perro -> editar perro',
);
expectParam('Mi perro', 'src/app/client/dog-profile.tsx', 'dogId');
expectLink(
  'Mi perro',
  'src/app/(tabs)/dog.tsx',
  /\/client\/class-detail\?enrollmentId=/,
  'src/app/client/class-detail.tsx',
  'historial del perro -> detalle de clase',
);

// 5) Pagos -> cargos -> detalle -> transferencia; pagos -> historial -> detalle.
expectLink(
  'Pagos/cargos',
  'src/app/(tabs)/payments.tsx',
  /\/client\/payment-obligations/,
  'src/app/client/payment-obligations.tsx',
  'Pagos -> cargos abiertos',
);
expectLink(
  'Pagos/cargos',
  'src/app/client/payment-obligations.tsx',
  /\/client\/payment-obligation-detail\?obligationId=/,
  'src/app/client/payment-obligation-detail.tsx',
  'cargos -> detalle de cargo',
);
expectParam('Pagos/cargos', 'src/app/client/payment-obligation-detail.tsx', 'obligationId');
expectLink(
  'Pagos/cargos',
  'src/app/client/payment-obligation-detail.tsx',
  /\/client\/payment-transfer\?obligationId=/,
  'src/app/client/payment-transfer.tsx',
  'detalle de cargo -> transferir',
);
expectParam('Pagos/cargos', 'src/app/client/payment-transfer.tsx', 'obligationId');
expectLink(
  'Pagos/historial',
  'src/app/(tabs)/payments.tsx',
  /\/client\/payment-history/,
  'src/app/client/payment-history.tsx',
  'Pagos -> historial',
);
expectLink(
  'Pagos/historial',
  'src/app/client/payment-history.tsx',
  /\/client\/payment-detail\?paymentId=/,
  'src/app/client/payment-detail.tsx',
  'historial -> detalle de pago',
);
expectParam('Pagos/historial', 'src/app/client/payment-detail.tsx', 'paymentId');

if (failures.length) {
  console.error('NAVIGATION SMOKE FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('NAVIGATION SMOKE OK: clases, práctica, cuenta, perros y pagos conservan sus recorridos críticos.');
