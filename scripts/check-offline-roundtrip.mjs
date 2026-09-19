import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta ${rel}.`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

function must(rel, pattern, message) {
  if (!pattern.test(read(rel))) failures.push(message);
}

function mustNot(rel, pattern, message) {
  if (pattern.test(read(rel))) failures.push(message);
}

// Arranque online: prepara lecturas críticas y reintenta escrituras pendientes sin bloquearse entre sí.
must('src/services/client-offline-sync.service.ts', /Promise\.allSettled/, 'El warm offline dejó de aislar fallos por recurso.');
for (const key of ['announcements', 'dogs', 'programs', 'membership', 'paymentSummary']) {
  must('src/services/client-offline-sync.service.ts', new RegExp(`clientReadKeys\\.${key}`), `El warm offline dejó de preparar ${key}.`);
}
must('src/services/client-offline-sync.service.ts', /cacheCalendar\(userId\)/, 'El warm offline dejó de preparar Calendario.');
must('src/services/client-offline-sync.service.ts', /clientReadKeys\.calendarEvents/, 'El warm offline dejó de guardar eventos del Calendario.');
must('src/services/client-offline-sync.service.ts', /clientReadKeys\.calendarClasses/, 'El warm offline dejó de guardar clases del Calendario.');
must('src/services/client-offline-sync.service.ts', /getMyMemberVisits\(userId, 500\)/, 'El warm offline dejó de preparar visitas de socio.');
must('src/services/client-offline-sync.service.ts', /flushPendingClientWrites\(userId\)[\s\S]*await cachePracticeActivity\(userId\)/, 'El warm offline dejó de refrescar actividad después de vaciar las colas.');
must('src/services/client-offline-sync.service.ts', /flushPendingAttendanceOperations/, 'El warm offline dejó de reintentar asistencias y visitas.');
must('src/services/client-offline-sync.service.ts', /flushPendingPracticeSessions/, 'El warm offline dejó de reintentar prácticas.');
must('src/services/client-offline-sync.service.ts', /flushPendingValueExposures/, 'El warm offline dejó de reintentar exposiciones de valor.');
must('src/services/client-offline-sync.service.ts', /practiceOutbox/, 'El resultado del warm dejó de reportar la cola de prácticas.');
must('src/services/client-offline-sync.service.ts', /valueExposureOutbox/, 'El resultado del warm dejó de reportar la cola de exposiciones de valor.');

// Regreso a primer plano: ambas colas vuelven a intentarse, cada una de forma independiente.
must('src/app/_layout.tsx', /AppState\.addEventListener\('change'/, 'La app dejó de detectar el regreso a primer plano.');
must('src/app/_layout.tsx', /Promise\.allSettled\(\[[\s\S]*flushPendingAttendanceOperations\(user\.id\)[\s\S]*flushPendingPracticeSessions\(user\.id\)[\s\S]*flushPendingValueExposures\(user\.id\)/, 'Foreground dejó de reintentar asistencias/visitas, prácticas y exposiciones juntas.');

// Exposición de valor offline: local-first, hora real y retry durable.
must('src/services/value-exposure-outbox.service.ts', /AsyncStorage/, 'Exposición de valor dejó de usar outbox durable.');
must('src/services/value-exposure-outbox.service.ts', /p_occurred_at: operation\.occurredAt/, 'Exposición de valor dejó de conservar la hora original.');
must('src/services/value-exposure-outbox.service.ts', /recordValueExposureDurably/, 'Exposición de valor dejó de persistir antes de intentar red.');
must('src/services/value-exposure-outbox.service.ts', /flushPendingValueExposures/, 'Exposición de valor perdió retry de la cola.');
must('src/services/value-exposure-outbox.service.ts', /networkFailure: isLikelyNetworkError\(error\)/, 'Exposición de valor dejó de clasificar fallos de red.');
must('src/services/value-exposure-outbox.service.ts', /if \(result\.networkFailure\) break/, 'Una exposición fallida volvió a bloquear todas las posteriores aunque hubiera red.');


// Identidad offline: un solo generador determinista, válido para UUID de PostgreSQL.
must('src/utils/offline-id.utils.ts', /Constants\.sessionId/, 'IDs offline dejaron de incorporar el namespace único de sesión Expo.');
must('src/utils/offline-id.utils.ts', /UUID v8/, 'IDs offline dejaron de documentar su formato UUID de aplicación.');
mustNot('src/utils/offline-id.utils.ts', /Math\.random\s*\(/, 'El generador offline volvió a depender de Math.random().');
for (const rel of [
  'src/services/attendance-outbox.service.ts',
  'src/services/practice.service.ts',
  'src/services/value-exposure-outbox.service.ts',
]) {
  must(rel, /createOfflineUuid/, `${rel} dejó de usar el generador offline canónico.`);
  mustNot(rel, /Math\.random\s*\(/, `${rel} volvió a generar identificadores con un generador pseudoaleatorio JS.`);
}

// QR offline: cola durable, identidad idempotente y hora real de captura.
must('src/services/attendance-outbox.service.ts', /AsyncStorage/, 'La cola QR dejó de ser persistente.');
must('src/services/attendance-outbox.service.ts', /p_client_event_id/, 'La cola QR perdió client_event_id.');
must('src/services/attendance-outbox.service.ts', /p_captured_at/, 'La cola QR dejó de conservar la hora de captura.');
must('src/services/attendance-outbox.service.ts', /outboxMutationChains/, 'La cola QR perdió serialización de mutaciones.');
must('src/services/attendance-outbox.service.ts', /syncInFlightByOperation/, 'La cola QR perdió deduplicación de sincronizaciones simultáneas.');
must('src/services/attendance-outbox.service.ts', /networkFailure = isLikelyNetworkError\(error\)/, 'La cola QR dejó de distinguir caída de red de error específico de una operación.');
must('src/services/attendance-outbox.service.ts', /result\.status === 'pending' && result\.networkFailure[\s\S]{0,80}break/, 'La cola QR volvió a bloquear el lote ante cualquier error pendiente.');
must('src/app/attendance.tsx', /queueClassAttendance/, 'El escáner de clases dejó de encolar offline.');
must('src/app/attendance.tsx', /queueMemberVisit/, 'El escáner de socio dejó de encolar offline.');
must('supabase/sql/ucapsa-offline-attendance-outbox.sql', /program_attendances_enrollment_client_event_unique_idx/, 'Backend perdió idempotencia de asistencia por client_event_id.');
must('supabase/sql/ucapsa-offline-attendance-outbox.sql', /member_visits_user_client_event_unique_idx/, 'Backend perdió idempotencia de visita por client_event_id.');

// Prácticas offline: primero local, luego red; una caída de red conserva el evento para retry.
must('src/services/practice.service.ts', /PENDING_PRACTICE_PREFIX/, 'Prácticas perdió su cola local persistente.');
must('src/services/practice.service.ts', /AsyncStorage\.setItem\(pendingPracticeKey\(userId\)/, 'Prácticas dejó de persistir la cola por usuario.');
must('src/services/practice.service.ts', /await enqueuePending\(pending\)[\s\S]*await withOperationTimeout\(syncOne\(pending\)/, 'Guardar práctica dejó de persistir local antes de intentar red.');
must('src/services/practice.service.ts', /p_client_event_id: item\.clientEventId/, 'Prácticas perdió client_event_id al sincronizar.');
must('src/services/practice.service.ts', /p_completed_at: item\.completedAt/, 'Prácticas dejó de conservar la hora real de finalización.');
must('src/services/practice.service.ts', /if \(isLikelyNetworkError\(error\)\)[\s\S]*syncStatus: 'pending'/, 'Una caída de red dejó de devolver práctica pendiente.');
must('src/services/practice.service.ts', /await removePending\(input\.userId, clientEventId\)[\s\S]*syncStatus: 'synced'/, 'Una práctica sincronizada dejó de retirarse de la cola tras confirmación.');
must('src/services/practice.service.ts', /mergeActivityEntries\(cached\?\.entries \?\? \[\], pending/, 'La actividad offline dejó de incluir prácticas pendientes.');

// 6.1: cache-first no significa offline. La caché se pinta silenciosamente y el aviso
// sólo se activa después de que el intento remoto haya fallado o haya devuelto fallback.
must('src/screens/home/HomeExperienceScreen.tsx', /'hydrated'/, 'Inicio perdió el estado neutro de caché hidratada.');
must('src/screens/home/HomeExperienceScreen.tsx', /if \(savedSnapshot\)[\s\S]*setSnapshotState\('hydrated'\)/, 'Inicio volvió a marcar la caché como offline antes del refresh remoto.');
must('src/screens/home/HomeExperienceScreen.tsx', /else if \(cachedSnapshot\)[\s\S]*setSnapshotState\('cached'\)/, 'Inicio dejó de marcar fallback guardado cuando sí falla el snapshot remoto.');
must('src/screens/home/HomeExperienceScreen.tsx', /snapshotState === 'cached' \|\| snapshotState === 'partial'/, 'Inicio perdió el aviso posterior a un fallo real de actualización.');
mustNot('src/screens/home/HomeExperienceScreen.tsx', /if \(savedSnapshot\)[\s\S]{0,220}setSnapshotState\('cached'\)/, 'Inicio vuelve a mostrar aviso offline durante la simple hidratación de caché.');

for (const rel of [
  'src/app/client/practice-activity.tsx',
  'src/app/client/practice-history.tsx',
  'src/app/client/practice-detail.tsx',
]) {
  must(rel, /getCachedMyPracticeActivity/, `${rel} dejó de hidratar actividad local antes de consultar red.`);
  must(rel, /setUsingSavedData\(false\)[\s\S]*getCachedMyPracticeActivity/, `${rel} dejó de iniciar la hidratación local sin falso aviso offline.`);
  must(rel, /setUsingSavedData\(true\)|source !== 'remote'/, `${rel} dejó de activar fallback sólo después del intento remoto.`);
  mustNot(rel, /activity && activity\.source !== 'remote' \?/, `${rel} volvió a usar el origen de la caché hidratada como aviso offline inmediato.`);
}
must('src/app/client/practice-activity.tsx', /readClientResource<ProgramEnrollmentWithDetails\[\]>\(user\.id, clientReadKeys\.programs\)/, 'Racha dejó de hidratar el programa activo desde caché.');
must('src/app/client/practice-activity.tsx', /cachedPrograms\.data\.find\(\(item\) => item\.enrollment\.status === 'active'\)/, 'Racha ya no puede conservar el programa activo sin conexión.');
must('src/app/client/practice-activity.tsx', /writeClientResource\(user\.id, clientReadKeys\.programs, sanitizeProgramRowsForCache\(remotePrograms\)\)/, 'Racha dejó de actualizar la caché de programas después de una lectura remota correcta.');

// 6.2: el resumen de pagos puede mostrar una CLABE compacta, pero sólo desde una
// lectura viva. Los datos bancarios nunca entran a la caché y se borran antes de verificar.
must('src/services/client-offline-sync.service.ts', /createPaymentOfflineSummary/, 'El resumen de pagos dejó de prepararse para offline.');
mustNot('src/services/client-read-cache.service.ts', /paymentSettings/, 'Los datos bancarios volvieron a ser elegibles para caché.');
must('src/app/(tabs)/payments.tsx', /setBankSettings\(null\)/, 'Pagos dejó de borrar la CLABE anterior antes de una nueva verificación.');
must('src/app/(tabs)/payments.tsx', /withOperationTimeout\(getPaymentSettings\(\), DEFAULT_READ_TIMEOUT_MS, 'payments-bank-settings'\)/, 'Pagos dejó de consultar la configuración bancaria en vivo.');
must('src/app/(tabs)/payments.tsx', /settings\?\.is_active[\s\S]*isValidClabe\(settings\.clabe\)[\s\S]*settings\.bank_name\?\.trim\(\)[\s\S]*settings\.account_holder\?\.trim\(\)/, 'Pagos dejó de exigir configuración bancaria completa y CLABE válida.');
must('src/app/(tabs)/payments.tsx', /const clabe = normalizeClabe\(bankSettings\?\.clabe\)/, 'Pagos dejó de normalizar la CLABE antes de copiarla.');
must('src/app/(tabs)/payments.tsx', /!isValidClabe\(clabe\)/, 'Pagos dejó de revalidar la CLABE justo antes de copiarla.');
must('src/app/(tabs)/payments.tsx', /Conéctate para consultar la CLABE vigente/, 'Pagos dejó de ocultar la CLABE cuando no pudo verificarla en vivo.');
must('src/app/client/payment-transfer.tsx', /setSettings\(null\)/, 'Transferir dejó de borrar datos bancarios anteriores antes de verificar.');
must('src/app/client/payment-transfer.tsx', /getPaymentSettings\(\)/, 'Transferir dejó de consultar datos bancarios en vivo.');
must('src/app/client/payment-transfer.tsx', /isValidClabe\(settings\.clabe\)/, 'Transferir dejó de exigir CLABE válida.');

// 6.4: el warm y las pantallas secundarias también siguen cache-first -> refresh -> fallback.
must('src/services/client-activity.service.ts', /\.select\('id,visit_date,visited_at,source'\)/, 'Visitas volvió a cachear campos que no necesita para el uso offline.');
must('src/services/client-activity.service.ts', /writeClientResource\(userId, clientReadKeys\.memberVisits, visits\)/, 'Visitas dejó de actualizar su caché canónica tras una lectura remota correcta.');
must('src/services/client-activity.service.ts', /Promise\.all\(\[[\s\S]*clientReadKeys\.programs[\s\S]*getCachedMyMemberVisits\(userId\)[\s\S]*getCachedMyPracticeActivity\(userId\)/, 'Insignias offline dejó de derivarse de programas, visitas y prácticas canónicas.');
must('src/services/client-activity.service.ts', /if \(!programCache \|\| !visitCache \|\| !practice \|\| !practice\.savedAt\) return null;/, 'Insignias offline volvió a inventar ceros cuando falta una fuente canónica.');

for (const rel of ['src/app/client/member-visits.tsx', 'src/app/client/activity-achievements.tsx']) {
  must(rel, /setUsingSavedData\(false\)[\s\S]*const cached = await getCached/, `${rel} dejó de hidratar caché en estado neutro.`);
  must(rel, /if \(cached\)[\s\S]*setLoading\(false\)/, `${rel} dejó de pintar la caché inmediatamente.`);
  must(rel, /catch[\s\S]*if \(cached\)[\s\S]*setUsingSavedData\(true\)/, `${rel} dejó de reservar el aviso offline para un fallo remoto real.`);
  must(rel, /OfflineDataNotice/, `${rel} perdió la comunicación explícita del fallback real.`);
}

must('src/app/(tabs)/calendar.tsx', /readClientResource<UcapsaEvent\[\]>\(cacheScope, clientReadKeys\.calendarEvents\)/, 'Calendario dejó de hidratar eventos guardados.');
must('src/app/(tabs)/calendar.tsx', /readClientResource<CalendarClassesOfflineSnapshot>\(cacheScope, clientReadKeys\.calendarClasses\)/, 'Calendario dejó de hidratar clases guardadas.');
must('src/app/(tabs)/calendar.tsx', /getCachedMyPracticeActivity/, 'Calendario dejó de hidratar prácticas guardadas.');
must('src/app/(tabs)/calendar.tsx', /const staleSource =[\s\S]*if \(staleSource\)[\s\S]*setUsingSavedData\(true\)/, 'Calendario dejó de activar el aviso sólo después de fallos remotos reales.');

must('src/app/achievements.tsx', /setUsingCachedData\(false\)[\s\S]*getCachedAchievementsForUser\(user\.id\)/, 'Logros globales volvió a marcar caché hidratada como offline antes del refresh.');
must('src/app/achievements.tsx', /catch[\s\S]*setUsingCachedData\(Boolean\(cached\)\)/, 'Logros globales dejó de activar fallback sólo tras fallo remoto.');
must('src/app/client/dog-achievements.tsx', /setUsingSavedData\(false\)[\s\S]*getCachedAchievementsForDog\(user\.id, dogId\)/, 'Logros del perro volvió a marcar caché hidratada como offline antes del refresh.');
must('src/app/client/dog-achievements.tsx', /catch[\s\S]*if \(cachedAchievements\)[\s\S]*setUsingSavedData\(true\)/, 'Logros del perro dejó de activar fallback sólo tras fallo remoto.');

// Pantallas auditadas previamente: conservan caché y sólo comunican fallback tras fallo remoto.
must('src/app/(tabs)/classes.tsx', /Mostrando clases guardadas/, 'Clases perdió su aviso offline.');
must('src/app/(tabs)/dog.tsx', /OfflineDataNotice/, 'Mi perro perdió su aviso offline.');
must('src/app/(tabs)/payments.tsx', /Mostrando saldo guardado/, 'Pagos perdió su aviso de saldo guardado.');
must('src/app/(tabs)/announcements.tsx', /if \(localAnnouncements\)[\s\S]*setUsingSavedData\(true\)/, 'Anuncios dejó de activar fallback sólo después de fallar la red.');
must('src/app/client/attendance-history.tsx', /catch[\s\S]*if \(cached\) setUsingSavedData\(true\)/, 'Asistencias dejó de reservar el aviso offline para un fallo remoto real.');
must('src/app/client/membership.tsx', /membershipResult\.status === 'rejected' && membershipCache[\s\S]*setUsingSavedData\(true\)/, 'Membresía dejó de reservar el aviso offline para un fallo remoto real.');
must('src/app/(tabs)/services.tsx', /catch[\s\S]*if \(cached\) setUsingSavedData\(true\)/, 'Servicios dejó de reservar el aviso offline para un fallo remoto real.');

if (failures.length) {
  console.error('OFFLINE ROUNDTRIP FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('OFFLINE ROUNDTRIP OK: cache-first, refresh remoto, fallback real, warm global, colas y seguridad bancaria revisados.');
