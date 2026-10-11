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

for (const token of [
  "title: isClient ? 'Agenda' : 'Calendario'",
  "title: 'Mis perros'",
  "href: isAdmin ? null : '/profile'",
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
  'Perfil de {selectedDog.name}',
  '/client/dog-profile?dogId=',
  'Detalle competitivo',
  'Historial',
  'clases tomadas',
  '<DogAvatar',
]) {
  if (!dog.includes(token)) throw new Error('Dog clarity missing: ' + token);
}
for (const token of ['LOGROS UCAPSA', 'AchievementBadgeGrid', 'Tus perros y Ranking']) {
  if (dog.includes(token)) throw new Error('Mi perro volvió a mezclar un dominio secundario: ' + token);
}

for (const token of [
  'getWeekDateKeys',
  "'Todo el día'",
  'dayAgendaItems.map',
  'timelineRow',
  "setMonthExpanded(false)",
  "activityDateKeys.has(dateKey)",
  'useLocalSearchParams',
  'if (announcement.announcement_date) return toDateKey(announcement.announcement_date);',
]) {
  if (!calendar.includes(token)) throw new Error('Agenda UX missing: ' + token);
}
for (const token of ['AgendaFilter', 'agendaFilters', '<Legend', 'legendRow']) {
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

for (const token of ['DOG_AVATAR_OPTIONS', 'DOG_AVATAR_COLORS', 'No pide acceso a tus fotos']) {
  if (!dogProfile.includes(token)) throw new Error('Avatar local del perro incompleto: ' + token);
}
if (/expo-image-picker|requestMediaLibraryPermissionsAsync|launchImageLibraryAsync/.test(dogProfile)) {
  throw new Error('El avatar del perro no debe pedir permisos de fototeca.');
}

console.log('UCAPSA client UX clarity: PASS');
