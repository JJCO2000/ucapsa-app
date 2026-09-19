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

// Mi perro = perro seleccionado -> resumen compacto de logros -> ficha completa dog-specific.
mustNot('src/app/(tabs)/dog.tsx', /ClientPageHeader/, 'Mi perro volvió al hero grande redundante.');
must('src/app/(tabs)/dog.tsx', /\/client\/dog-profile\?dogId=/, 'Mi perro perdió la edición del perro seleccionado.');
must('src/app/(tabs)/dog.tsx', /\/client\/class-detail\?enrollmentId=/, 'El historial de Mi perro dejó de bajar al detalle de clase.');
must('src/app/(tabs)/dog.tsx', /LOGROS UCAPSA/, 'Mi perro perdió el bloque canónico de logros del perro.');
must('src/app/(tabs)/dog.tsx', /AchievementBadgeGrid[\s\S]*maxItems=\{4\}/, 'Mi perro dejó de limitar los logros al resumen compacto de cuatro etapas.');
must('src/components/domain/AchievementBadgeGrid.tsx', /if \(maxItems && visibleItems\[0\]\?\.dogId\)/, 'El resumen de Mi perro dejó de compactar la progresión dog-specific.');
must('src/components/domain/AchievementBadgeGrid.tsx', /\/client\/dog-achievements\?dogId=/, 'El resumen de logros perdió el acceso a la ficha completa del perro.');
must('src/app/client/dog-achievements.tsx', /useLocalSearchParams<\{ dogId\?/, 'La ficha de logros dejó de resolver un perro concreto por dogId.');
must('src/app/client/dog-achievements.tsx', /getCachedAchievementsForDog\(user\.id, dogId\)/, 'La ficha de logros dejó de hidratar caché por perro.');
must('src/app/client/dog-achievements.tsx', /getMyDogAchievements\(dogId,/, 'La ficha de logros dejó de refrescar la progresión del perro seleccionado.');
must('src/app/client/dog-achievements.tsx', /AchievementBadgeGrid items=\{items\}/, 'La ficha de logros perdió el roadmap completo de progresión.');

// Actividad = resumen -> listado -> ficha particular.
mustNot('src/app/client/practice-activity.tsx', /ClientPageHeader/, 'Racha y práctica volvió a repetir un hero debajo del título de navegación.');
must('src/app/client/practice-activity.tsx', /\.slice\(0,\s*3\)/, 'Racha y práctica dejó de limitar el resumen a 3 prácticas recientes.');
must('src/app/client/practice-activity.tsx', /\/client\/practice-history/, 'Racha y práctica perdió el acceso al historial completo.');
must('src/app/client/practice-activity.tsx', /\/client\/practice-detail\?practiceId=/, 'Las prácticas recientes dejaron de abrir una ficha particular.');
must('src/app/client/practice-history.tsx', /\/client\/practice-detail\?practiceId=/, 'El historial de prácticas dejó de abrir la ficha particular.');
must('src/app/client/practice-detail.tsx', /useLocalSearchParams/, 'Detalle de práctica dejó de resolver una práctica concreta por id.');
must('src/app/client/practice-detail.tsx', /getMyPracticeActivity/, 'Detalle de práctica dejó de usar la fuente canónica de actividad.');
mustNot('src/app/client/activity-achievements.tsx', /ClientPageHeader/, 'Insignias de actividad volvió a repetir un hero redundante.');

// Admin Usuarios = directorio general. Cliente/socio baja a su ficha canónica;
// las cuentas administrativas pueden mostrar detalle local. Logros viven en ficha particular.
must('src/app/admin/users.tsx', /\/admin\/customer\?userId=/, 'Usuarios dejó de bajar clientes/socios a la ficha canónica.');
mustNot('src/app/admin/users.tsx', /awardAchievementToUser|forceMembershipForProfile|deactivateMembershipForProfile/, 'Usuarios volvió a mezclar logros o membresía dentro del directorio.');
must('src/app/admin/customer.tsx', /\/admin\/customer-achievements\?userId=/, 'Cliente perdió la ficha particular de Logros.');
must('src/app/admin/customer-achievements.tsx', /awardAchievementToUser/, 'La ficha de Logros perdió la acción administrativa canónica.');

// Admin Clases = una sola tarea: inscripciones. Horarios, cancelaciones y asistencias
// viven en pantallas canónicas separadas para evitar dos fuentes de UI/estado.
must('src/app/admin/classes.tsx', />Inscripciones</, 'Admin Clases perdió su trabajo principal de inscripciones.');
must('src/app/admin/classes.tsx', /\/admin\/customer-class\?userId=/, 'Admin Clases dejó de bajar a la ficha particular de inscripción.');
mustNot('src/app/admin/classes.tsx', /ClassCancellationModal|SchedulesModal|AttendanceModal|updateProgramSchedule|registerProgramAttendance/, 'Admin Clases volvió a mezclar horarios, cancelaciones o asistencias dentro de Inscripciones.');
must('src/app/(tabs)/admin-classes.tsx', /\/admin\/class-schedules/, 'Hub de Clases perdió la entrada separada a Horarios.');
must('src/app/(tabs)/admin-classes.tsx', /\/admin\/class-cancellations/, 'Hub de Clases perdió la entrada separada a Cancelaciones.');
must('src/app/(tabs)/admin-classes.tsx', /admin-clients\?intent=attendance/, 'Hub de Clases perdió la entrada separada a Asistencia manual.');

// Clases = contexto/listado -> ficha de inscripción -> acción QR.
mustNot('src/app/(tabs)/classes.tsx', /router\.push\('\/attendance'/, 'Clases volvió a saltarse la ficha antes de Registrar asistencia.');
must('src/app/(tabs)/classes.tsx', /\/client\/class-detail\?enrollmentId=/, 'Clases perdió la navegación a la ficha particular.');
must('src/app/client/class-detail.tsx', /router\.push\('\/attendance'/, 'Detalle de clase perdió la acción concreta Registrar asistencia.');
must('src/app/client/class-detail.tsx', /getCanonicalNextProgramSessions/, 'Detalle de clase dejó de compartir la próxima sesión canónica.');

// Pagos = resumen + CLABE compacta informativa -> listado/ficha -> acción Transferir.
// El resumen puede copiar la CLABE vigente, pero no salta la ficha ni ejecuta el flujo completo de transferencia.
must('src/app/(tabs)/payments.tsx', /CLABE UCAPSA/, 'Pagos perdió la CLABE compacta del resumen.');
mustNot('src/app/(tabs)/payments.tsx', /\/client\/payment-transfer/, 'Pagos volvió a saltarse la ficha de cargo antes de Transferir.');
mustNot('src/app/(tabs)/payments.tsx', /transfer_instructions|clip_url/, 'Pagos volvió a mezclar instrucciones bancarias profundas dentro del resumen.');
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