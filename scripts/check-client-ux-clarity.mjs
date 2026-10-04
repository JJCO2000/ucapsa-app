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
  "router.push('/payments'",
  "router.push('/client/membership'",
  "router.push('/account-settings?section=notifications'",
  "router.push('/services'",
]) {
  if (!profile.includes(token)) throw new Error('Profile hub missing: ' + token);
}

for (const token of [
  'Perfil de {selectedDog.name}',
  '/client/dog-profile?dogId=',
  'Ver todos los logros',
  '/client/dog-achievements?dogId=',
  'clases tomadas',
]) {
  if (!dog.includes(token)) throw new Error('Dog clarity missing: ' + token);
}

for (const token of [
  "type AgendaFilter = 'all' | 'classes' | 'events' | 'announcements' | 'practice'",
  'getWeekDateKeys',
  'Ver mes',
  'Ver semana',
  'showClasses ? <Legend label="Clases"',
  "classDot: { backgroundColor: ucapsaBrand.colors.blue }",
  "practiceDot: { backgroundColor: ucapsaBrand.colors.green }",
  'useLocalSearchParams',
]) {
  if (!calendar.includes(token)) throw new Error('Agenda UX missing: ' + token);
}

if (/selected:\s*true,[\s\S]{0,180}practice/.test(calendar)) {
  throw new Error('Practice dates must not masquerade as the selected calendar day.');
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

console.log('UCAPSA client UX clarity: PASS');
