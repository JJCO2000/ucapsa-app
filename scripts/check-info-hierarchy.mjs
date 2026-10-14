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

// Mis perros = perro seleccionado -> perfil -> entrenamiento actual -> accesos breves a logros/historial.
// Ranking vive en Inicio/Competencia; los detalles secundarios no se expanden en el overview.
mustNot('src/app/(tabs)/dog.tsx', /ClientPageHeader/, 'Mi perro volvió al hero grande redundante.');
must('src/app/(tabs)/dog.tsx', /\/client\/dog-profile\?dogId=/, 'Mi perro perdió la edición del perro seleccionado.');
must('src/app/(tabs)/dog.tsx', /ENTRENAMIENTO ACTUAL/, 'Mi perro perdió el entrenamiento actual como estado principal.');
must('src/app/(tabs)/dog.tsx', /\/client\/dog-achievements\?dogId=/, 'Mis perros perdió el acceso breve a Logros.');
must('src/app/(tabs)/dog.tsx', /\/client\/dog-history\?dogId=/, 'Mis perros perdió el acceso breve a Historial.');
must('src/app/client/dog-history.tsx', /\/client\/class-detail\?enrollmentId=/, 'El historial dedicado dejó de bajar al detalle de clase.');
mustNot('src/app/(tabs)/dog.tsx', /LOGROS UCAPSA|AchievementBadgeGrid|Tus perros y Ranking|Detalle competitivo|historyExpanded/, 'Mis perros volvió a mezclar detalles secundarios.');
must('src/app/(tabs)/profile.tsx', /title="Mis logros"/, 'Perfil perdió el acceso general a Mis logros.');
must('src/app/(tabs)/profile.tsx', /title="Insignias de actividad"/, 'Perfil perdió hitos de actividad.');
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

// Admin principal = Inicio como bandeja de decisiones + cuatro dominios operativos.
// Gestión sustituye la antigua pestaña Comunicación y deja herramientas secundarias
// dentro de una subpantalla, sin convertir Inicio en menú.
must('src/app/(tabs)/_layout.tsx', /name="admin-home"[\s\S]*title: 'Inicio'/, 'Admin perdió Inicio como pestaña principal.');
must('src/app/(tabs)/_layout.tsx', /name="admin-clients"[\s\S]*title: 'Clientes'/, 'Admin perdió Clientes como dominio principal.');
must('src/app/(tabs)/_layout.tsx', /name="admin-classes"[\s\S]*title: 'Clases'/, 'Admin perdió Clases como dominio principal.');
must('src/app/(tabs)/_layout.tsx', /name="admin-payments"[\s\S]*title: 'Pagos'/, 'Admin perdió Pagos como dominio principal.');
must('src/app/(tabs)/_layout.tsx', /name="admin-communication"[^\n]*href: null/,
  'Comunicación debe conservar su ruta, fuera de las pestañas principales.');
must('src/app/(tabs)/_layout.tsx', /name="admin-more"[^\n]*href: adminWorkspace[^\n]*title: 'Gestión'/,
  'Gestión debe dar acceso directo a exámenes, restaurante y comunicación.');
must('src/app/(tabs)/admin-more.tsx', /Calificar examen[\s\S]*\/admin\/competition-quick-grade/,
  'Gestión perdió evaluación rápida.');
must('src/app/(tabs)/admin-more.tsx', /Restaurante \/ comida[\s\S]*\/admin\/restaurant/,
  'Gestión perdió restaurante.');
must('src/app/(tabs)/admin-more.tsx', /Avisos y comunicación[\s\S]*\/admin-communication/,
  'Gestión perdió comunicación.');


must('src/app/(tabs)/admin-home.tsx', /Requiere tu intervención/, 'Inicio Admin dejó de priorizar decisiones pendientes.');
must('src/app/(tabs)/admin-home.tsx', /Todo al día/, 'Inicio Admin perdió el estado vacío de decisiones.');
must('src/app/(tabs)/admin-home.tsx', /getAdminTrainingDecisionRows/, 'Inicio Admin dejó de incluir decisiones de entrenamiento.');
must('src/app/(tabs)/admin-home.tsx', /getAdminPaymentAttentionRows/, 'Inicio Admin dejó de incluir pagos que requieren intervención.');
must('src/app/(tabs)/admin-home.tsx', /getAdminMembershipRows/, 'Inicio Admin dejó de incluir solicitudes de membresía.');
mustNot('src/app/(tabs)/admin-home.tsx', /Crear anuncio|Registrar asistencia|Registrar pago|Calendario|Competencia UCAPSA/,
  'Inicio Admin volvió a convertirse en un menú de herramientas.');
// Un único acceso de alta frecuencia en el hero es compatible con Inicio como
// bandeja de decisiones; no se permiten menús ni tarjetas de herramientas.
must('src/app/(tabs)/admin-home.tsx', /accessibilityLabel="Abrir Restaurante y gestión de comida"[\s\S]{0,180}onPress=\{\(\) => router\.push\('\/admin\/restaurant'/,
  'Restaurante perdió su acceso directo en el encabezado de Admin.');
mustNot('src/app/(tabs)/admin-home.tsx', /quickAccessRow|quickAccessButton|Herramientas frecuentes|<MenuRow/,
  'Inicio Admin volvió a incorporar un menú de herramientas.');

must('src/app/(tabs)/admin-clients.tsx', /Membresías/, 'Clientes perdió la gestión temática de membresías.');
must('src/app/(tabs)/admin-clients.tsx', /Visitas de socios/, 'Clientes perdió la gestión temática de visitas de socios.');
must('src/app/(tabs)/admin-clients.tsx', /Continuidad/, 'Clientes perdió la gestión temática de continuidad.');
must('src/app/(tabs)/admin-classes.tsx', /Competencia UCAPSA/, 'Clases perdió la competencia/ranking como parte del dominio de entrenamiento.');
must('src/app/(tabs)/admin-communication.tsx', /Avisos/, 'Comunicación perdió Avisos.');
must('src/app/(tabs)/admin-communication.tsx', /Calendario/, 'Comunicación perdió Calendario.');
must('src/app/(tabs)/admin-communication.tsx', /Notificaciones/, 'Comunicación perdió Notificaciones.');
must('src/app/(tabs)/admin-communication.tsx', /Eventos/, 'Comunicación perdió Eventos.');

// Admin Clases = una sola tarea: inscripciones. Horarios, cancelaciones y asistencias
// viven en pantallas canónicas separadas para evitar dos fuentes de UI/estado.
must('src/app/admin/classes.tsx', />Inscripciones</, 'Admin Clases perdió su trabajo principal de inscripciones.');
must('src/app/admin/classes.tsx', /\/admin\/customer-class\?userId=/, 'Admin Clases dejó de bajar a la ficha particular de inscripción.');
mustNot('src/app/admin/classes.tsx', /ClassCancellationModal|SchedulesModal|AttendanceModal|updateProgramSchedule|registerProgramAttendance/, 'Admin Clases volvió a mezclar horarios, cancelaciones o asistencias dentro de Inscripciones.');
must('src/app/(tabs)/admin-classes.tsx', /\/admin\/class-schedules/, 'Hub de Clases perdió la entrada separada a Horarios.');
must('src/app/(tabs)/admin-classes.tsx', /\/admin\/class-cancellations/, 'Hub de Clases perdió la entrada separada a Cancelaciones.');
must('src/app/(tabs)/admin-classes.tsx', /admin-clients\?intent=attendance/, 'Hub de Clases perdió la entrada separada a Asistencia manual.');

// UI administrativa general -> acción única. Indicadores son datos, no menús duplicados.
must('src/app/(tabs)/admin-classes.tsx', /<Metric label="Puppy activos"[^>]*\/>/, 'Clases perdió el resumen de Puppy.');
must('src/app/(tabs)/admin-classes.tsx', /<Metric label="Comandos activos"[^>]*\/>/, 'Clases perdió el resumen de Comandos.');
mustNot('src/app/(tabs)/admin-classes.tsx', /<Metric[^>]*onPress=/, 'Los indicadores de Clases volvieron a duplicar accesos operativos.');
must('src/app/(tabs)/admin-classes.tsx', /getAdminProgramRows\(\)/, 'Los indicadores deben usar inscripciones canónicas.');

// Exámenes Entrenador: catálogo general separado por estado -> acciones sobre un examen concreto.
must('src/app/(tabs)/trainer-exams.tsx', /catalogView === 'published'/, 'Falta vista de exámenes publicados.');
must('src/app/(tabs)/trainer-exams.tsx', /catalogView === 'drafts'/, 'Falta vista de borradores.');
must('src/app/(tabs)/trainer-exams.tsx', /setCatalogView\('drafts'\)/, 'El alta de borrador no regresa al contexto correcto.');
must('src/app/(tabs)/trainer-exams.tsx', /setCatalogView\('published'\)/, 'La publicación no regresa al catálogo oficial.');
must('src/app/(tabs)/trainer-exams.tsx', /canPublishExamDefinition/, 'Publicar examen no puede perder su control de permisos.');

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
must('src/screens/home/HomeExperienceScreen.tsx', /\/client\/dog-achievements\?dogId=/, 'Inicio perdió la navegación contextual a los logros del perro.');
must('src/screens/home/HomeExperienceScreen.tsx', /\/client\/competition/, 'Inicio perdió el acceso visible al Ranking.');

if (failures.length) {
  console.error('INFO HIERARCHY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('INFO HIERARCHY OK: resumen -> contexto/listado -> ficha particular -> acción concreta.');