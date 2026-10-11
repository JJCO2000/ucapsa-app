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
const dogHistory = read('src/app/client/dog-history.tsx');
const ranking = read('src/app/client/competition-ranking.tsx');
const dogPhotoService = read('src/services/dog-photos.service.ts');
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
  'Perfil de {selectedDog.name}',
  '/client/dog-profile?dogId=',
  'ENTRENAMIENTO ACTUAL',
  '/client/dog-achievements?dogId=',
  '/client/dog-history?dogId=',
]) {
  if (!dog.includes(token)) throw new Error('Dog clarity missing: ' + token);
}
for (const token of ['LOGROS UCAPSA', 'AchievementBadgeGrid', 'Tus perros y Ranking', 'Detalle competitivo', 'historyExpanded']) {
  if (dog.includes(token)) throw new Error('Mi perro volvió a mezclar un dominio secundario: ' + token);
}
for (const token of ['Programas y clases registradas.', '/client/class-detail?enrollmentId=']) {
  if (!dogHistory.includes(token)) throw new Error('Dog history detail missing: ' + token);
}

for (const token of [
  'getWeekDateKeys',
  "'Todo el día'",
  'dayAgendaItems.map',
  'timelineRow',
  "setMonthExpanded(false)",
  "activityDateKeys.has(dateKey)",
  'Día libre',
  "'Mes'",
  "'Semana'",
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

for (const token of [
  'CameraView',
  'uploadMyDogPhoto',
  'removeMyDogPhoto',
  'La foto es privada',
]) {
  if (!dogProfile.includes(token)) throw new Error('Private dog photo UI missing: ' + token);
}
for (const token of ['DOG_AVATAR_OPTIONS', 'DOG_AVATAR_COLORS', 'No pide acceso a tus fotos']) {
  if (dogProfile.includes(token)) throw new Error('El perfil del perro volvió al selector de avatar/color: ' + token);
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
if (!home.includes('!loading && user ? (') || !home.includes('summary={competitionSummary}')) {
  throw new Error('Inicio must keep Ranking discoverable even before the user has a position.');
}

console.log('UCAPSA client UX clarity: PASS');
