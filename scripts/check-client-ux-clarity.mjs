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
  'setMissingContact(!cleanContact)', 'setMissingPassword(!password)',
  'Escribe tu correo o celular registrado.', 'Escribe tu contraseña.',
  'accessibilityLabel="Correo o celular para iniciar sesión"',
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
for (const token of ['DOG_AVATAR_OPTIONS', 'DOG_AVATAR_COLORS', 'avatar_key: avatarKey', 'avatar_color: avatarColor']) {
  if (!dogProfile.includes(token)) throw new Error('El perfil del perro perdió el selector público persistente: ' + token);
}
if (dogProfile.includes('No pide acceso a tus fotos')) {
  throw new Error('No afirmar que nunca se solicita acceso: la cámara sigue siendo opcional.');
}
for (const token of ['dog-photos', 'createSignedUrl', 'set_my_dog_photo_path']) {
  if (!dogPhotoService.includes(token)) throw new Error('Private dog photo service missing: ' + token);
}
for (const token of ['getPrivateDogPhotoUrls', 'RankingDogAvatar', 'photoUrlForDog={(id) => myDogs.find']) {
  if (!ranking.includes(token)) throw new Error('Own dog photo is not preserved in Ranking: ' + token);
}
const competitionPodium = read('src/components/domain/CompetitionPodium.tsx');
const competitionOverview = read('src/app/client/competition.tsx');
for (const token of ['const PLACES = [2, 1, 3]', 'row.ranking_position', 'row.competitive_score', 'myDogIds?.has(dogId)', 'photoUrlForDog?.(dogId)', 'DogAvatar', 'Sin clasificar']) {
  if (!competitionPodium.includes(token)) throw new Error('El podio compartido perdió integridad: ' + token);
}
if (!competitionOverview.includes('<CompetitionPodium rows={rows} compact />')
  || !ranking.includes('<CompetitionPodium')) {
  throw new Error('Competencia y Ranking deben compartir el mismo podio oficial.');
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
// El deep-link de una notificación debe apuntar a la fecha concreta, no al mes actual.
if (!notificationRoute.includes(String.raw`/^\d{4}-\d{2}-\d{2}$/.test(date)`)
  || notificationRoute.includes(String.raw`/^\\d{4}-\\d{2}-\\d{2}$/.test(date)`)) {
  throw new Error('Recordatorio Puppy dejó de navegar a la fecha real por regex mal escapada.');
}
const notificationService = read('src/services/notifications.service.ts');
if (!notificationService.includes('cancelIntroAgendaLocalRemindersForUser(userId)')
  || !localReminder.includes('AsyncStorage.multiRemove(keys)')) {
  throw new Error('Desactivar alertas de clases debe cancelar avisos introductorios locales.');
}
if (!roster.includes('Promise.allSettled([') || !roster.includes('introWarning')) {
  throw new Error('El roster oficial debe sobrevivir a fallas de consultas de visitas iniciales.');
}
if (!notificationRoute.includes('intro_class_reminder') || !notificationRoute.includes('class_date')) {
  throw new Error('Notificación de clase debe navegar a su fecha.');
}
if (!competitionDetailService.includes("supabase.rpc('get_my_basic_dog_profile'") ||
    competitionDetailService.includes("getMyDogs()") ||
    !competitionDetail.includes('Aún no hay actividad competitiva registrada')) {
  throw new Error('Perro sin datos competitivos debe mostrar estado vacío, sin inventar error de conexión.');
}
if (!restaurantMenu.includes('usingCache && visibleSections.length === 0')
  || !restaurantMenu.includes('!usingCache && visibleSections.length === 0')
  || !restaurantMenu.includes('setSections([])')) {
  throw new Error('Menú no debe presentar caché vacía/no verificada como catálogo actualizado.');
}
if (!home.includes('accessibilityLabel="Consultar menú del restaurante UCAPSA"') ||
    !restaurantMenu.includes('Actualmente UCAPSA no tiene productos habilitados')) {
  throw new Error('Menú de comida debe seguir accesible y explicar catálogo no publicado.');
}

console.log('UCAPSA client UX clarity: PASS');

const contextualHelp = read('src/components/ui/ContextualHelpTip.tsx');
const guideContent = read('src/constants/clientHelp.ts');
const helpStorage = read('src/services/quick-help.service.ts');
const helpPage = read('src/app/client/quick-help.tsx');
for (const [tab, screen] of [
  ['home', 'src/screens/home/HomeExperienceScreen.tsx'],
  ['classes', 'src/app/(tabs)/classes.tsx'],
  ['calendar', 'src/app/(tabs)/calendar.tsx'],
  ['dog', 'src/app/(tabs)/dog.tsx'],
  ['profile', 'src/app/(tabs)/profile.tsx'],
]) {
  if (!guideContent.includes("tab: '" + tab + "'") || !read(screen).includes('tab="' + tab + '"')) {
    throw new Error('Falta el consejo de ' + tab);
  }
}
if (!contextualHelp.includes('markTabHelpSeen(userId!, tab)') ||
    !contextualHelp.includes('router.push(guide.route as never)') ||
    !contextualHelp.includes('accessibilityLabel="Cerrar consejo"')) {
  throw new Error('El consejo debe poder cerrarse o iniciar una acción real.');
}
if (!helpStorage.includes("'ucapsa-tab-help-v1:' + userId + ':' + tab") ||
    !helpStorage.includes('AsyncStorage.setItem(tabHelpKey(userId, tab)')) {
  throw new Error('La preferencia de cada guía debe persistir por cuenta y pestaña.');
}
if (!helpPage.includes('clientHelpGuides.map')) throw new Error('Ayuda y pestañas sin fuente única.');

const clientLayout = read('src/app/client/_layout.tsx');
if (!calendar.includes('key={visibleMonth}') ||
    !calendar.includes("current={visibleMonth + '-01'}") ||
    !calendar.includes('if (nextMonth === visibleMonth) return;') ||
    !calendar.includes('setSelectedDate(today);') ||
    !calendar.includes('setVisibleMonth(today.slice(0, 7));') ||
    !calendar.includes('calendarScrollRef.current?.scrollTo({')) {
  throw new Error('Agenda: Hoy debe regresar al mes y día locales sin perder sincronización.');
}
if (!calendar.includes('!isStaff && user ? <ContextualHelpTip') ||
    !contextualHelp.includes("role === 'client' || role === 'member'") ||
    !contextualHelp.includes('!loading && user?.id === userId') ||
    !helpPage.includes('if (isTrainer) return <Redirect href="/trainer-home" />;') ||
    !helpPage.includes('if (isAdmin) return <Redirect href="/admin-home" />;') ||
    !helpPage.includes("if (role !== 'client' && role !== 'member')")) {
  throw new Error('El tutorial no debe mostrarse a Superadmin, Admin ni Entrenador.');
}
if (!helpStorage.includes("tabHelpKey(userId, tab)") ||
    !helpStorage.includes('AsyncStorage.getItem') ||
    !helpStorage.includes('AsyncStorage.setItem')) {
  throw new Error('Marca local por cuenta y pestaña inválida.');
}

const dogService = read('src/services/dogs.service.ts');
for (const token of [
  'updateMyDogAvatar(dogId,',
  'avatarWriteBusy.current',
  'while (desiredAvatar.current.key !== persistedAvatar.current.key',
  'persistedAvatar.current = { key: saved.avatar_key, color: saved.avatar_color }',
  'desiredAvatar.current = previous;',
  'setAvatarExpanded((open) => !open)',
  'setAvatarColorsExpanded((open) => !open)',
  'onPress={() => { selectAvatar({ key: option.key }); setAvatarExpanded(false); }}',
  'onPress={() => { selectAvatar({ color }); setAvatarColorsExpanded(false); }}',
  'disabled={saving || avatarSaving}',
]) {
  if (!dogProfile.includes(token)) throw new Error('Avatar automatico perdió control: ' + token);
}
if (!dogService.includes(".from('dogs')") ||
    !dogService.includes('.update({ avatar_key: avatarKey, avatar_color: avatarColor })') ||
    !dogService.includes(".eq('is_active', true)")) {
  throw new Error('El avatar debe actualizar exclusivamente sus dos preferencias bajo RLS.');
}
if (dogService.includes('.update({ avatar_key: avatarKey, avatar_color: avatarColor, name')) {
  throw new Error('El guardado de avatar no debe sobrescribir el borrador de identificacion.');
}

const expandable = read('src/components/ui/ExpandablePhoto.tsx');
if (!expandable.includes('resizeMode="contain"')
  || !expandable.includes('onRequestClose={close}')
  || !expandable.includes('event.stopPropagation()')
  || !expandable.includes('accessibilityLabel="Cerrar foto"')
  || !expandable.includes('no-store') && expandable.includes('createSignedUrl(')) {
  throw new Error('Visor de fotografía perdió cierre, imagen completa o aislamiento de acceso.');
}
for (const path of [
  'src/app/client/dog-profile.tsx',
  'src/app/client/competition-ranking.tsx',
  'src/components/domain/CompetitionPodium.tsx',
  'src/app/(tabs)/dog.tsx',
]) {
  if (!read(path).includes('ExpandablePhoto')) throw new Error('Falta imagen ampliable: ' + path);
}
if (!read('src/app/(tabs)/dog.tsx').includes('onPress={openEditProfile}')) {
  throw new Error('Ver foto no debe eliminar edición del perfil.');
}
if (!read('src/components/domain/CompetitionPodium.tsx').includes('myDogIds?.has(dogId)')) {
  throw new Error('El podio no puede exponer fotografías privadas de otros usuarios.');
}
if (read('src/app/account-settings.tsx').includes('Correo de contacto para preinscripción')) {
  throw new Error('Datos de contacto: no mostrar procesos internos.');
}
