import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function must(rel, pattern, label) { if (!pattern.test(read(rel))) failures.push(label); }
function mustNot(rel, pattern, label) { if (pattern.test(read(rel))) failures.push(label); }

must('src/lib/supabase.ts', /createClient<Database>/, 'Supabase client no está tipado con Database.');
must('src/lib/supabase.ts', /database\.types/, 'Supabase client no usa los tipos canónicos con overlay offline.');
const generated = read('src/types/database.generated.ts');
if (!/export (type|interface) Database/.test(generated)) failures.push('Falta Database generado desde Supabase.');
mustNot('src/types/database.types.ts', /Record<string,\s*never>/, 'Sigue activo el placeholder Record<string, never>.');
must('src/types/database.types.ts', /client_event_id/, 'El overlay tipado perdió client_event_id para sincronización offline.');
must('src/types/database.types.ts', /p_captured_at/, 'El overlay tipado perdió la hora real de captura offline.');
must('src/types/database.helpers.ts', /database\.types/, 'Los helpers de base no usan los tipos canónicos con overlay offline.');

must('src/app/(tabs)/dog.tsx', /account-settings\?section=profile/, 'Mi perro perdió el acceso separado a Mis datos.');
must('src/app/(tabs)/dog.tsx', /\/client\/dog-profile\?dogId=/, 'El lápiz de Mi perro dejó de editar al perro seleccionado.');
must('src/app/(tabs)/dog.tsx', /useLocalSearchParams/, 'Mi perro dejó de aceptar el dogId de navegación contextual.');
must('src/app/(tabs)/dog.tsx', /loadRunRef/, 'Mi perro perdió la guarda contra respuestas asíncronas obsoletas.');
must('src/app/(tabs)/dog.tsx', /cacheScopeRef/, 'Mi perro dejó de limpiar el estado al cambiar de usuario.');
must('src/app/(tabs)/dog.tsx', /selectedHistory/, 'Mi perro volvió a mezclar el historial con el bloque de entrenamiento.');
must('src/app/(tabs)/dog.tsx', /!programWarning && selectedActive\[0\]/, 'Mi perro dejó de aislar el entrenamiento de otras secciones.');
must('src/app/(tabs)/dog.tsx', /achievementReady \? \(/, 'Mi perro perdió el bloque independiente de logros por perro.');

mustNot('src/app/admin/classes.tsx', /TextInput\s+value=\{form\.dogName\}/, 'Admin Clases aún usa perro como texto libre al crear.');
mustNot('src/app/admin/classes.tsx', /TextInput\s+value=\{editForm\.dogName\}/, 'Admin Clases aún usa perro como texto libre al editar.');
mustNot('src/app/admin/customer-class.tsx', /<Field label="Perro"/, 'Ficha de clase aún usa perro como texto libre.');

mustNot('src/services/notifications.service.ts', /p_(device_name|device_id|app_ownership|app_version|project_id):[^\r\n]*\?\? null/, 'RPC de notificaciones envía null a argumentos opcionales tipados.');
mustNot('src/services/programs.service.ts', /p_(cycle_start_date|schedule_id|change_note|notes):[^\r\n]*(\?\? null|\|\| null)/, 'RPC de programas envía null a argumentos opcionales tipados.');

for (const rel of ['src/app/admin/classes.tsx', 'src/app/admin/customer-class.tsx', 'src/services/programs.service.ts']) {
  must(rel, /dogId/, `${rel} no conserva dogId como relación explícita.`);
}

must('src/constants/programCompletion.ts', /PROGRAM_COMPLETION_ACHIEVEMENT_CODES/, 'Falta el registro central de logros por programa.');
must('src/services/achievements.service.ts', /getProgramCompletionAchievementCode/, 'Logros no usa el registro central de finalización de programas.');
mustNot('src/services/achievements.service.ts', /function\s+programCompletionAchievementCode/, 'Logros volvió a duplicar el mapeo programa -> medalla.');
must('src/services/memberships.service.ts', /getMyMembershipEligibility/, 'Membresía no tiene una consulta canónica de elegibilidad.');
must('src/services/memberships.service.ts', /program_completion_achievement/, 'Membresía perdió el fallback de evidencia histórica por logro de programa.');
must('src/app/client/membership.tsx', /getMyMembershipEligibility/, 'Pantalla de membresía no usa la elegibilidad canónica.');
mustNot('src/app/client/membership.tsx', /isMembershipEligibleFromPrograms\(programs\)/, 'Pantalla de membresía volvió a decidir elegibilidad desde una lista local de programas.');
mustNot('src/app/attendance.tsx', /isMembershipActiveToday/, 'Escáner volvió a expirar socios activos por fecha.');
must('src/app/attendance.tsx', /cachedMembership\?\.data\.status === 'active'/, 'Escáner no permite usar la membresía activa guardada sin conexión.');
mustNot('src/app/client/attendance-history.tsx', /!enrollmentId\)\s*return/, 'Historial de asistencias volvió a exigir enrollmentId y rompe APROVECHASTE desde Home.');
must('src/app/client/attendance-history.tsx', /Historial de asistencias/, 'Falta la vista agregada de asistencias desde APROVECHASTE.');
mustNot('src/components/domain/CustomerValueSnapshotCard.tsx', /parts\.push\(`Membresía vencida/, 'TIENES volvió a presentar una membresía vencida como valor disponible.');
must('supabase/sql/ucapsa-membership-lifetime-and-comandos-progression.sql', /new\.end_date := null/, 'Backend perdió la regla de membresía activa sin vencimiento por fecha.');
must('src/services/customer-value-merge.service.ts', /membership_lifetime_normalized/, 'Snapshot de Inicio perdió la normalización de membresía vitalicia.');

must('src/screens/home/HomeExperienceScreen.tsx', /loadRunRef/, 'Inicio perdió la guarda contra respuestas asíncronas obsoletas.');
must('src/screens/home/HomeExperienceScreen.tsx', /mergeCustomerValueSnapshotWithCache/, 'Inicio volvió al fallback todo-o-nada en vez de mezclar por fuente.');
mustNot('src/screens/home/HomeExperienceScreen.tsx', /new Date\(selectedAnnouncement\?\.announcement_date\)/, 'Inicio volvió a parsear una fecha civil de aviso como UTC.');
must('src/services/customer-value-merge.service.ts', /cached_fallback:/, 'Falta trazabilidad de qué fuente de Inicio cayó a caché.');
must('src/screens/home/HomeExperienceScreen.tsx', /nextClass[\s\S]*find\(\(program\) => program\.enrollmentId === nextClass\.enrollmentId\)/, 'Inicio volvió a elegir un programa principal arbitrario en vez del asociado a la próxima clase.');
must('src/screens/home/HomeExperienceScreen.tsx', /recentAchievement\.dogId/, 'Inicio perdió el perro asociado al logro reciente.');
must('src/screens/home/HomeExperienceScreen.tsx', /\/dog\?dogId=/, 'El logro formal de Inicio dejó de abrir Mi perro en el perro correcto.');
must('src/services/customer-value.service.ts', /sourceId: string \| null;\s*dogId: string \| null;\s*dogName: string \| null;/, 'El snapshot de Inicio dejó de conservar la identidad del perro en logros.');
must('src/services/customer-value.service.ts', /dogId,\s*dogName:/, 'El snapshot de Inicio dejó de mapear el perro real del logro.');

must('src/services/attendance-outbox.service.ts', /AsyncStorage/, 'El QR perdió la cola local persistente.');
must('src/services/attendance-outbox.service.ts', /p_client_event_id/, 'El QR perdió la clave idempotente de sincronización.');
must('src/services/attendance-outbox.service.ts', /p_captured_at/, 'El QR dejó de conservar la hora real de captura offline.');
mustNot('src/services/attendance-outbox.service.ts', /as never/, 'La cola offline volvió a saltarse los tipos de Supabase.');
mustNot('src/services/member-visits.service.ts', /as never/, 'Visitas de socio volvió a saltarse los tipos de Supabase.');
must('src/services/client-offline-sync.service.ts', /flushPendingAttendanceOperations/, 'El arranque dejó de reintentar asistencias y visitas pendientes.');
must('src/services/attendance-outbox.service.ts', /outboxMutationChains/, 'La cola offline perdió la serialización de mutaciones locales.');
must('src/services/attendance-outbox.service.ts', /syncInFlightByOperation/, 'La cola offline volvió a permitir sincronizaciones duplicadas simultáneas.');
must('src/app/_layout.tsx', /AppState\.addEventListener\('change'/, 'La app dejó de escuchar el regreso a primer plano para reintentar la cola offline.');
must('src/app/_layout.tsx', /flushPendingAttendanceOperations\(user\.id\)/, 'La app dejó de reintentar la cola offline al volver a primer plano.');
must('src/app/attendance.tsx', /queueClassAttendance/, 'El escáner de clases volvió a escribir solo en red.');
must('src/app/attendance.tsx', /queueMemberVisit/, 'El escáner de socios volvió a escribir solo en red.');
must('supabase/sql/ucapsa-offline-attendance-outbox.sql', /program_attendances_enrollment_client_event_unique_idx/, 'Backend perdió idempotencia de asistencias offline.');
must('supabase/sql/ucapsa-offline-attendance-outbox.sql', /member_visits_user_client_event_unique_idx/, 'Backend perdió idempotencia de visitas offline.');
must('supabase/sql/ucapsa-offline-attendance-outbox.sql', /interval '7 days'/, 'Backend perdió el límite de antigüedad para capturas offline.');

must('src/app/(tabs)/classes.tsx', /Tu programa y próximas sesiones/, 'Clases perdió el encabezado compacto orientado al programa actual.');
mustNot('src/app/(tabs)/classes.tsx', /ClientPageHeader/, 'Clases volvió al hero compartido que ocupa demasiado espacio vertical.');
must('src/app/(tabs)/classes.tsx', /router\.push\('\/attendance'/, 'Clases perdió el acceso a Registrar asistencia.');
must('src/app/(tabs)/classes.tsx', /\/client\/class-detail\?enrollmentId=/, 'Clases perdió el acceso al detalle del programa.');
must('src/app/(tabs)/classes.tsx', /Mostrando clases guardadas/, 'Clases perdió el aviso de datos offline guardados.');
must('src/app/(tabs)/classes.tsx', /loadRunRef/, 'Clases perdió la guarda contra respuestas asíncronas obsoletas.');
must('src/app/(tabs)/classes.tsx', /cacheScopeRef/, 'Clases dejó de limpiar el estado al cambiar de usuario.');
mustNot('src/app/(tabs)/classes.tsx', /courseStages|CompactRouteCard|RUTA DE|>Tu ruta</, 'Clases volvió a duplicar la ruta de progreso que pertenece a Mi perro.');

must('src/services/program-next-session.service.ts', /getProgramScheduleFromTimeline/, 'La próxima sesión dejó de respetar versiones de horario.');
must('src/services/program-next-session.service.ts', /getProgramClassCancellations/, 'La próxima sesión dejó de consultar cancelaciones activas.');
must('src/services/program-next-session.service.ts', /resolveNextProgramSessionAcrossEnrollments/, 'Falta el selector canónico de próxima sesión entre inscripciones.');
must('src/app/(tabs)/classes.tsx', /getCanonicalNextProgramSessions/, 'Clases dejó de usar el selector canónico de próxima sesión.');
must('src/app/client/class-detail.tsx', /getCanonicalNextProgramSessions/, 'Detalle de clase dejó de usar el selector canónico de próxima sesión.');
must('src/services/customer-value.service.ts', /resolveNextProgramSessionAcrossEnrollments/, 'Inicio dejó de usar el selector canónico de próxima sesión.');
mustNot('src/app/(tabs)/classes.tsx', /getNextProgramScheduleDate/, 'Clases volvió a calcular la próxima sesión con una regla paralela.');
mustNot('src/app/client/class-detail.tsx', /getNextProgramScheduleDate/, 'Detalle de clase volvió a calcular la próxima sesión con una regla paralela.');

must('src/app/(tabs)/services.tsx', /Tu membresía y accesos UCAPSA/, 'Servicios perdió el encabezado compacto orientado al acceso del cliente.');
must('src/app/(tabs)/services.tsx', /TU ACCESO DE SOCIO/, 'Servicios perdió los accesos rápidos de socio.');
must('src/app/(tabs)/services.tsx', /\/client\/membership/, 'Servicios perdió el acceso a Membresía.');
must('src/app/(tabs)/services.tsx', /\/client\/points/, 'Servicios perdió el acceso a Perro del Año.');
must('src/app/(tabs)/services.tsx', /\/client\/member-visits/, 'Servicios perdió el historial de visitas.');
must('src/app/(tabs)/services.tsx', /router\.push\('\/restaurant'/, 'Servicios perdió el menú del restaurante.');
must('src/app/(tabs)/services.tsx', /router\.push\('\/reviews'/, 'Servicios perdió el flujo de reseña en Google.');
must('src/app/(tabs)/services.tsx', /readClientResource<MembershipOfflineSummary>/, 'Servicios perdió la lectura offline de membresía.');
must('src/app/(tabs)/services.tsx', /OfflineDataNotice/, 'Servicios perdió el aviso de datos guardados.');
must('src/app/(tabs)/services.tsx', /loadRunRef/, 'Servicios perdió la guarda contra respuestas asíncronas obsoletas.');
must('src/app/(tabs)/services.tsx', /cacheScopeRef/, 'Servicios dejó de limpiar el estado al cambiar de usuario.');
must('src/app/(tabs)/services.tsx', /membership\?\.status === 'active' && effective === 'expired'/, 'Servicios volvió a expirar automáticamente una membresía que Administración mantiene activa.');
mustNot('src/app/(tabs)/services.tsx', /subtitle="Membresía, restaurante, compras y contacto directo con UCAPSA\."/, 'Servicios volvió al hero grande y redundante del diseño anterior.');

const scanRoots = ['src', 'scripts'];
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const scanRoot of scanRoots) {
  const absoluteRoot = path.join(root, scanRoot);
  for (const file of walk(absoluteRoot).filter((value) => /\.(ts|tsx|mjs|js)$/.test(value))) {
    const relFile = path.relative(root, file).replaceAll('\\', '/');
    const text = fs.readFileSync(file, 'utf8');
    if (/\d{18}/.test(text)) failures.push(`CLABE de 18 dígitos hardcodeada en ${relFile}.`);
    const replacementChar = String.fromCharCode(0xfffd);
    const mojibakeLead = new RegExp(`[${String.fromCharCode(0xc3)}${String.fromCharCode(0xc2)}].`);
    if (text.includes(replacementChar) || mojibakeLead.test(text)) failures.push(`Texto UTF-8 dañado o mojibake detectado en ${relFile}.`);
    const missingEnye = new RegExp('\\ba' + 'nos?\\b', 'i');
    if (missingEnye.test(text)) failures.push(`Texto sin eñe detectado en ${relFile}; usa año/años.`);
  }
}

if (failures.length) {
  console.error('SOURCE INTEGRITY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('SOURCE INTEGRITY OK: tipos, perros, rutas críticas, offline, jerarquía de información, próxima sesión, UTF-8, textos y CLABE revisados.');