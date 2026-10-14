import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const tabs = read('src/app/(tabs)/_layout.tsx');
const profile = read('src/app/(tabs)/profile.tsx');
const dog = read('src/app/(tabs)/dog.tsx');
const calendar = read('src/app/(tabs)/calendar.tsx');
const announcements = read('src/app/(tabs)/announcements.tsx');
const notificationSettings = read('src/components/domain/NotificationSettingsCard.tsx');
const notificationNavigation = read('src/hooks/useNotificationNavigation.ts');
const home = read('src/screens/home/HomeExperienceScreen.tsx');
const dogProfile = read('src/app/client/dog-profile.tsx');
const payments = read('src/app/(tabs)/payments.tsx');
const services = read('src/app/(tabs)/services.tsx');
const membership = read('src/app/client/membership.tsx');
const accountSettings = read('src/app/account-settings.tsx');
const login = read('src/app/auth/login.tsx');
const interests = read('src/app/client/program-interest.tsx');
const adminInterests = read('src/app/admin/program-interests.tsx');
const dogHistory = read('src/app/client/dog-history.tsx');
const ranking = read('src/app/client/competition-ranking.tsx');
const dogPhotoService = read('src/services/dog-photos.service.ts');
const avatarOptions = read('src/constants/dogAvatar.ts');
const activityAchievements = read('src/constants/activityAchievements.ts');

for (const token of [
  "title: isClient ? 'Agenda' : 'Calendario'",
  "title: 'Mis perros'",
  "href: isStaff ? null : '/profile'",
  "href: isGuest ? '/services' : null",
  'name="payments" options={{ href: null',
]) {
  if (!tabs.includes(token)) throw new Error('Client tab clarity missing: ' + token);
}

for (const token of [
  'Perfil, perros, pagos, notificaciones y accesos en un solo lugar.',
  "router.push('/payments?from=profile'",
  "router.push('/client/membership?from=profile'",
  "router.push('/account-settings?section=notifications&from=profile'",
  "router.push('/services?from=profile'",
  "title=\"Mis logros\"",
  "title=\"Insignias de actividad\"",
]) {
  if (!profile.includes(token)) throw new Error('Profile hub missing: ' + token);
}

for (const token of [
  'Editar perfil de ${selectedDog.name}',
  '/client/dog-profile?dogId=',
  'ENTRENAMIENTO ACTUAL',
  'Logros {selectedDog.name}',
  '/client/dog-achievements?dogId=',
  '/client/dog-history?dogId=',
  'accessibilityLabel="Abrir ranking"',
  'accessibilityLabel="Agregar otro perro"',
]) {
  if (!dog.includes(token)) throw new Error('Dog clarity missing: ' + token);
}
for (const token of ['LOGROS UCAPSA', 'AchievementBadgeGrid', 'Tus perros y Ranking', 'Detalle competitivo', 'historyExpanded']) {
  if (dog.includes(token)) throw new Error('Mi perro volvió a mezclar un dominio secundario: ' + token);
}
for (const token of ['Programas y clases registradas.', '/client/class-detail?enrollmentId=']) {
  if (!dogHistory.includes(token)) throw new Error('Dog history detail missing: ' + token);
}

// Evidencia de UX: los errores de ingreso y solicitudes deben ser recuperables y visibles.
for (const token of [
  'setMissingEmail(!cleanEmail)', 'setMissingPassword(!password)',
  'Escribe tu correo electrónico.', 'Escribe tu contraseña.',
  'minHeight: 48', 'Crear cuenta', 'Recuperar contraseña',
]) {
  if (!login.includes(token)) throw new Error('Ingreso dejó de mostrar ayuda accionable: ' + token);
}
if (!interests.includes('!loading && !error && dogs.length === 0')) {
  throw new Error('No sugerir registrar un perro cuando solo falló la consulta.');
}
if (!interests.includes('accessibilityLiveRegion="polite"')) {
  throw new Error('Los cambios de estado de solicitudes dejaron de anunciarse accesiblemente.');
}
if (!adminInterests.includes('{!error ? requests.map((row) => (')) {
  throw new Error('La bandeja no puede presentar filas antiguas como confirmadas cuando la consulta falla.');
}

// La entrevista de Miguel cambió la UX: mes completo y anillos de oferta real,
// no selector semanal ni puntos rojos para anuncios/prácticas privadas.
for (const token of [
  "'Todo el día'",
  'dayAgendaItems.map',
  'timelineRow',
  'CalendarActivityRing',
  'buildCalendarServiceKinds',
  'dayComponent',
  'ringLegend',
  "'Sin actividad'",
  "'Puppy'",
  "'Comandos'",
  "'Otras actividades'",
  'Día libre',
  'useLocalSearchParams',
  'if (announcement.announcement_date) return toDateKey(announcement.announcement_date);',
]) {
  if (!calendar.includes(token)) throw new Error('Agenda UX missing: ' + token);
}
for (const token of ['AgendaFilter', 'agendaFilters', '<Legend', 'legendRow', 'monthExpanded ?']) {
  if (calendar.includes(token)) throw new Error('Agenda volvió a saturarse con controles redundantes: ' + token);
}

if (/marks\[key\]\s*=\s*\{[^\n}]*selected:\s*true/.test(calendar)) {
  throw new Error('Calendar activity markers must not masquerade as the selected day.');
}

for (const token of [
  'Solo comunicación de UCAPSA',
  'Aquí no aparecen mensajes ni conversaciones de otros clientes.',
  'Importantes',
  'Recientes',
  'compact={!isAdmin}',
]) {
  if (!announcements.includes(token)) throw new Error('Official notice clarity missing: ' + token);
}

for (const token of [
  'No incluyen mensajes de otros clientes ni conversaciones de grupo.',
  'Cambios de horario, cancelaciones y recordatorios de tus clases.',
  'Tú decides las categorías.',
]) {
  if (!notificationSettings.includes(token)) throw new Error('Notification clarity missing: ' + token);
}

for (const token of [
  'addNotificationResponseReceivedListener',
  'clearLastNotificationResponseAsync',
  'class_cancellation',
  'class_reminder',
  '/calendar?date=',
  "category === 'membership'",
  "category === 'achievements'",
]) {
  if (!notificationNavigation.includes(token)) throw new Error('Notification navigation missing: ' + token);
}

if (!home.includes('/client/dog-achievements?dogId=')) {
  throw new Error('Recent achievement must open the dog achievement detail directly.');
}
if (!home.includes("router.push('/client/competition'")) {
  throw new Error('Inicio perdió el acceso visible al Ranking.');
}

for (const source of [payments, services, membership, accountSettings]) {
  if (!source.includes('profile')) throw new Error('Un acceso desde Perfil perdió su retorno contextual.');
}

for (const token of [
  'CameraView',
  'uploadMyDogPhoto',
  'removeMyDogPhoto',
  'La foto es privada',
]) {
  if (!dogProfile.includes(token)) throw new Error('Private dog photo UI missing: ' + token);
}
// La base ya admite las 15 variantes; nunca esconderlas detrás de un flag de compilación.
if (!avatarOptions.includes('export const DOG_AVATAR_OPTIONS: Array<') || avatarOptions.includes("EXPO_PUBLIC_UCAPSA_EXTENDED_AVATARS")) {
  throw new Error('El catálogo de 15 avatares no debe quedar bloqueado por un flag obsoleto.');
}
for (const key of ["dog_heart", "dog_star", "dog_sun", "dog_moon", "dog_play"]) {
  if (!avatarOptions.includes("key: '" + key + "'")) throw new Error('Falta el avatar ' + key);
}
if (fs.existsSync('docs/product/guarderia-canine-internal-baseline.md')) {
  throw new Error('No publicar rutas ni horarios internos de Guardería mediante GitHub Pages.');
}
// Requisito actualizado: el propietario elige avatar público sin exponer la foto privada.
for (const token of ['DOG_AVATAR_OPTIONS', 'DOG_AVATAR_COLORS', 'avatar_key: avatarKey', 'avatar_color: avatarColor', 'La foto real sigue siendo privada']) {
  if (!dogProfile.includes(token)) throw new Error('El perfil del perro perdió el selector público persistente: ' + token);
}
if (dogProfile.includes('No pide acceso a tus fotos')) {
  throw new Error('No afirmar que nunca se solicita acceso: la cámara sigue siendo opcional.');
}
for (const token of ['dog-photos', 'createSignedUrl', 'set_my_dog_photo_path']) {
  if (!dogPhotoService.includes(token)) throw new Error('Private dog photo service missing: ' + token);
}
for (const token of ['getPrivateDogPhotoUrls', 'RankingDogAvatar', 'photoUrl={mine && row.dog_id']) {
  if (!ranking.includes(token)) throw new Error('Own dog photo is not preserved in Ranking: ' + token);
}
if (!activityAchievements.includes("code: 'attendance_100'")) {
  throw new Error('Profile activity achievements lost the 100-class milestone.');
}
if (!home.includes('accessibilityLabel="Abrir ranking"') || !home.includes("router.push('/client/competition'")) {
  throw new Error('Inicio must keep the compact Ranking shortcut discoverable even before the user has a position.');
}
if (!home.includes("onAttendance={() => router.push('/attendance'")) {
  throw new Error('Inicio perdió la cámara contextual de asistencia en Próxima clase.');
}
if (!home.includes('rsvpResponse={classRsvp}') || !home.includes('onRsvp={nextAction.kind')) {
  throw new Error('Inicio perdió la confirmación RSVP de la próxima clase.');
}

// SSOT de la agenda inicial: intención distinta de inscripción, confirmación y asistencia.
const introMigration = read('supabase/migrations/20261014013545_intro_class_agenda_plans.sql');
const staffMigration = read('supabase/migrations/20261014014437_staff_intro_class_agenda.sql');
const introService = read('src/services/intro-class-agenda.service.ts');
const localReminder = read('src/services/intro-class-reminder.service.ts');
const roster = read('src/app/(tabs)/trainer-classes.tsx');
const competitionDetailService = read('src/services/client-competition-summary.service.ts');
const competitionDetail = read('src/app/client/competition-dog.tsx');
const restaurantMenu = read('src/app/restaurant.tsx');
const notificationRoute = read('src/hooks/useNotificationNavigation.ts');
for (const token of ['public.intro_class_agenda_plans', 'enable row level security', 'p_dog_id uuid',
  "s.day_of_week=6", "s.start_time=time '10:00'", 'd.user_id=v_user', 'program_class_cancellations',
  "'planned','yes','no','cancelled'", 'grant select on public.intro_class_agenda_plans']) {
  if (!introMigration.includes(token)) throw new Error('Agenda inicial perdió validación de DB: ' + token);
}
for (const token of ['public.is_ucapsa_staff()', 'get_staff_intro_class_agenda', 'Solo el personal']) {
  if (!staffMigration.includes(token)) throw new Error('Consulta staff perdió protección: ' + token);
}
if (!introService.includes("supabase.rpc('get_staff_intro_class_agenda'") ||
    introService.includes("supabase.from('profiles')")) throw new Error('Staff no debe leer perfiles de forma general.');
for (const token of ['isSaturdayIntroClass', 'getMyProgramEnrollments', 'saveMyIntroAgendaPlan',
  'setMyClassRsvp', 'confirmEnrolledClass', 'Agendar visita', 'Quitar de mi agenda',
  'Sin inscripción: no disponible para agendar', 'Sí asistiré', 'No asistiré']) {
  if (!calendar.includes(token)) throw new Error('Calendario perdió las acciones diferenciadas: ' + token);
}
if (!roster.includes('getStaffIntroAgendaPlans') || !roster.includes('No son inscripciones')) {
  throw new Error('El Entrenador dejó de diferenciar visitas iniciales del roster oficial.');
}
if (!localReminder.includes('24 * 60 * 60 * 1000') ||
    !localReminder.includes('preferences.enabled') || !localReminder.includes('preferences.classes')) {
  throw new Error('Aviso inicial debe ser único, un día antes y opt-in.');
}
if (!notificationRoute.includes('intro_class_reminder') || !notificationRoute.includes('class_date')) {
  throw new Error('Notificación de clase debe navegar a su fecha.');
}
if (!competitionDetailService.includes('getMyCompetitionAccount') ||
    !competitionDetail.includes('Aún no hay actividad competitiva registrada')) {
  throw new Error('Perro sin datos competitivos debe mostrar estado vacío, sin inventar error de conexión.');
}
if (!home.includes('accessibilityLabel="Consultar menú del restaurante UCAPSA"') ||
    !restaurantMenu.includes('Actualmente UCAPSA no tiene productos habilitados')) {
  throw new Error('Menú de comida debe seguir accesible y explicar catálogo no publicado.');
}

console.log('UCAPSA client UX clarity: PASS');
