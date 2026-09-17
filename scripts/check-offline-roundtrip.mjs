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
must('src/services/client-offline-sync.service.ts', /flushPendingAttendanceOperations/, 'El warm offline dejó de reintentar asistencias y visitas.');
must('src/services/client-offline-sync.service.ts', /flushPendingPracticeSessions/, 'El warm offline dejó de reintentar prácticas.');
must('src/services/client-offline-sync.service.ts', /practiceOutbox/, 'El resultado del warm dejó de reportar la cola de prácticas.');

// Regreso a primer plano: ambas colas vuelven a intentarse, cada una de forma independiente.
must('src/app/_layout.tsx', /AppState\.addEventListener\('change'/, 'La app dejó de detectar el regreso a primer plano.');
must('src/app/_layout.tsx', /Promise\.allSettled\(\[[\s\S]*flushPendingAttendanceOperations\(user\.id\)[\s\S]*flushPendingPracticeSessions\(user\.id\)/, 'Foreground dejó de reintentar asistencias/visitas y prácticas juntas.');

// QR offline: cola durable, identidad idempotente y hora real de captura.
must('src/services/attendance-outbox.service.ts', /AsyncStorage/, 'La cola QR dejó de ser persistente.');
must('src/services/attendance-outbox.service.ts', /p_client_event_id/, 'La cola QR perdió client_event_id.');
must('src/services/attendance-outbox.service.ts', /p_captured_at/, 'La cola QR dejó de conservar la hora de captura.');
must('src/services/attendance-outbox.service.ts', /outboxMutationChains/, 'La cola QR perdió serialización de mutaciones.');
must('src/services/attendance-outbox.service.ts', /syncInFlightByOperation/, 'La cola QR perdió deduplicación de sincronizaciones simultáneas.');
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

// Pantallas ya auditadas: deben conservar caché y sólo comunicar fallback tras fallo remoto.
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

console.log('OFFLINE ROUNDTRIP OK: cache-first, refresh remoto, fallback real, colas, prácticas y seguridad bancaria revisados.');