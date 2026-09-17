import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function must(rel, pattern, message) {
  if (!pattern.test(read(rel))) failures.push(message);
}

function mustNot(rel, pattern, message) {
  if (pattern.test(read(rel))) failures.push(message);
}

// Cuenta = menú general -> ficha concreta -> edición/configuración.
must('src/app/account-settings.tsx', /Elige qué quieres gestionar\./, 'Ajustes dejó de funcionar como menú general de tareas.');
must('src/app/account-settings.tsx', /NotificationSettingsCard/, 'Notificaciones dejó de vivir como configuración concreta dentro de Cuenta.');
mustNot('src/app/account-settings.tsx', />ABRIR</, 'Ajustes volvió a añadir el texto redundante ABRIR a tarjetas ya navegables.');
mustNot('src/app/account-settings.tsx', /Socio UCAPSA/, 'Cuenta volvió a repetir una tarjeta de identidad antes de la tarea concreta.');

// Mi perro = perro seleccionado -> entrenamiento/logros/historial -> detalle/edición.
mustNot('src/app/(tabs)/dog.tsx', /ClientPageHeader/, 'Mi perro volvió al hero grande redundante.');
must('src/app/(tabs)/dog.tsx', /\/client\/dog-profile\?dogId=/, 'Mi perro perdió la edición del perro seleccionado.');
must('src/app/(tabs)/dog.tsx', /\/client\/class-detail\?enrollmentId=/, 'El historial de Mi perro dejó de bajar al detalle de clase.');
must('src/app/(tabs)/dog.tsx', /LOGROS UCAPSA/, 'Mi perro perdió el bloque canónico de logros del perro.');

// Actividad = resumen -> listado -> ficha particular.
mustNot('src/app/client/practice-activity.tsx', /ClientPageHeader/, 'Racha y práctica volvió a repetir un hero debajo del título de navegación.');
must('src/app/client/practice-activity.tsx', /\.slice\(0,\s*3\)/, 'Racha y práctica dejó de limitar el resumen a 3 prácticas recientes.');
must('src/app/client/practice-activity.tsx', /\/client\/practice-history/, 'Racha y práctica perdió el acceso al historial completo.');
must('src/app/client/practice-activity.tsx', /\/client\/practice-detail\?practiceId=/, 'Las prácticas recientes dejaron de abrir una ficha particular.');
must('src/app/client/practice-history.tsx', /\/client\/practice-detail\?practiceId=/, 'El historial de prácticas dejó de abrir la ficha particular.');
must('src/app/client/practice-detail.tsx', /useLocalSearchParams/, 'Detalle de práctica dejó de resolver una práctica concreta por id.');
must('src/app/client/practice-detail.tsx', /getMyPracticeActivity/, 'Detalle de práctica dejó de usar la fuente canónica de actividad.');
mustNot('src/app/client/activity-achievements.tsx', /ClientPageHeader/, 'Insignias de actividad volvió a repetir un hero redundante.');

// Clases = contexto/listado -> ficha de inscripción -> acción QR.
mustNot('src/app/(tabs)/classes.tsx', /router\.push\('\/attendance'/, 'Clases volvió a saltarse la ficha antes de Registrar asistencia.');
must('src/app/(tabs)/classes.tsx', /\/client\/class-detail\?enrollmentId=/, 'Clases perdió la navegación a la ficha particular.');
must('src/app/client/class-detail.tsx', /router\.push\('\/attendance'/, 'Detalle de clase perdió la acción concreta Registrar asistencia.');
must('src/app/client/class-detail.tsx', /getCanonicalNextProgramSessions/, 'Detalle de clase dejó de compartir la próxima sesión canónica.');

// Pagos = resumen -> listado/ficha -> acción Transferir.
mustNot('src/app/(tabs)/payments.tsx', /getPaymentSettings|CLABE|account_holder|bank_name/, 'Pagos volvió a mezclar la acción bancaria dentro del resumen.');
must('src/app/(tabs)/payments.tsx', /\.slice\(0,\s*3\)/, 'Pagos dejó de limitar cargos y pagos recientes en el resumen.');
must('src/app/(tabs)/payments.tsx', /\/client\/payment-obligations/, 'Pagos perdió el listado completo de cargos.');
must('src/app/(tabs)/payments.tsx', /\/client\/payment-obligation-detail\?obligationId=/, 'Un cargo reciente dejó de abrir su ficha particular.');
must('src/app/(tabs)/payments.tsx', /\/client\/payment-detail\?paymentId=/, 'Un pago reciente dejó de abrir su ficha particular.');
must('src/app/client/payment-obligations.tsx', /\/client\/payment-obligation-detail\?obligationId=/, 'El listado de cargos dejó de abrir el detalle.');
must('src/app/client/payment-obligation-detail.tsx', /\/client\/payment-transfer\?obligationId=/, 'El detalle de cargo perdió la acción concreta Transferir.');
must('src/app/client/payment-transfer.tsx', /getPaymentSettings/, 'Transferir dejó de verificar la cuenta bancaria en el nivel de acción.');
must('src/app/client/payment-transfer.tsx', /getMyPaymentOverview/, 'Transferir dejó de volver a verificar el cargo antes de pagar.');

// Inicio = resumen general; enlaza a contextos y fichas, pero no ejecuta acciones profundas.
must('src/screens/home/HomeCards.tsx', /const nextClass = snapshot\.whatIsNext\.nextClass/, 'Inicio dejó de alinear Tu programa con la próxima clase.');
must('src/screens/home/HomeCards.tsx', /find\(\(item\) => item\.enrollmentId === nextClass\.enrollmentId\)/, 'Inicio volvió a elegir programs[0] sin priorizar la inscripción de la próxima clase.');
mustNot('src/screens/home/HomeCards.tsx', /Escanear QR|qr-code-scanner/, 'Inicio volvió a ejecutar la acción profunda de escanear QR desde el resumen general.');
must('src/screens/home/HomeExperienceScreen.tsx', /\/client\/attendance-history/, 'Inicio perdió el acceso contextual al historial de clases.');
must('src/screens/home/HomeExperienceScreen.tsx', /\/client\/practice-activity/, 'Inicio perdió el acceso contextual a Racha y práctica.');
must('src/screens/home/HomeExperienceScreen.tsx', /\/dog\?dogId=/, 'Inicio perdió la navegación contextual al perro del logro.');

if (failures.length) {
  console.error('INFO HIERARCHY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('INFO HIERARCHY OK: resumen -> contexto/listado -> ficha particular -> acción concreta.');
