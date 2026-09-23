import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push('Falta archivo Rango 1 client competition: ' + rel);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const dog = read('src/app/(tabs)/dog.tsx');
const layout = read('src/app/client/_layout.tsx');
const accountScreen = read('src/app/client/competition.tsx');
const dogDetail = read('src/app/client/competition-dog.tsx');
const accountService = read('src/services/client-competition-account.service.ts');
const dogService = read('src/services/client-competition-summary.service.ts');
const home = read('src/screens/home/HomeExperienceScreen.tsx');
const homeCards = read('src/screens/home/HomeCards.tsx');
const warm = read('src/services/client-offline-sync.service.ts');
const pkg = read('package.json');

if (!/router\.push\('\/client\/competition'/.test(dog)) {
  failures.push('Mi perro perdió la entrada account-level a Competencia.');
}
if (!/competition-dog\?dogId=/.test(dog)) {
  failures.push('Mi perro perdió el detalle competitivo individual.');
}
if (/\/client\/competition\?dogId=/.test(dog)) {
  failures.push('La entrada principal de Competencia volvió a depender de un dogId.');
}
if (!/name=["']competition["']/.test(layout) || !/name=["']competition-dog["']/.test(layout)) {
  failures.push('Client layout no registra Competencia de cuenta y detalle por perro.');
}

for (const token of [
  'getMyDogs',
  ".from('ucapsa_competition_ranges')",
  ".eq('owner_user_id', cleanUserId)",
  ".in('dog_id', dogIds)",
  ".from('ucapsa_exam_official_results')",
  'readClientResource',
  'writeClientResource',
  'competition-account',
]) {
  if (!accountService.includes(token)) failures.push('Read model de cuenta perdió contrato: ' + token);
}

for (const token of [
  ".from('dogs')",
  ".eq('id', cleanDogId)",
  ".eq('user_id', userId)",
  'competition-dog:',
]) {
  if (!dogService.includes(token)) failures.push('Detalle por perro perdió contrato: ' + token);
}

const cacheIndex = accountScreen.indexOf('getCachedMyCompetitionAccount');
const refreshIndex = accountScreen.indexOf('refreshMyCompetitionAccount');
if (cacheIndex < 0 || refreshIndex < 0 || cacheIndex > refreshIndex) {
  failures.push('Competencia de cuenta debe hidratar cache antes del refresh remoto.');
}
if (!/OfflineDataNotice/.test(accountScreen) || !/Mostrando competencia guardada/.test(accountScreen)) {
  failures.push('Competencia de cuenta perdió aviso offline.');
}
for (const token of [
  'getAccountCompetitionSeasons',
  'snapshot.dogs.map',
  'Tus perros esta temporada',
  'competition-dog?dogId=',
  'competition-ranking?seasonId=',
]) {
  if (!accountScreen.includes(token)) failures.push('Competencia de cuenta perdió UI/flujo: ' + token);
}
if (/competition-ranking\?seasonId=[\s\S]{0,220}&dogId=/.test(accountScreen)) {
  failures.push('Competencia de cuenta volvió a abrir Ranking con un único dogId.');
}

for (const token of [
  'constancy_events_count',
  'required_exams_count',
  'missing_required_exams_count',
  'total_points_awarded',
  'max_points',
  'range_name',
  'range_code',
  'is_constancy_outstanding',
  'last_event_date',
  'competition-constancy?dogId=',
]) {
  if (!dogDetail.includes(token)) failures.push('Detalle competitivo por perro perdió dato útil: ' + token);
}
if (/constancy_percentile/.test(dogDetail) || /Percentil desde la cima/.test(dogDetail)) {
  failures.push('El percentil exacto pertenece al detalle de Constancia, no al resumen por perro.');
}

if (!/CompetitionHomeCard/.test(home) || !/router\.push\('\/client\/competition'/.test(home)) {
  failures.push('Inicio perdió el acceso contextual a Competencia de cuenta.');
}
if (!/COMPETENCIA UCAPSA/.test(homeCards) || !/rankingPosition/.test(homeCards)) {
  failures.push('Tarjeta de Inicio perdió el resumen competitivo de los perros.');
}

for (const token of [
  'competition: boolean',
  'refreshMyCompetitionAccount',
  'refreshMyDogCompetition',
  'refreshCompetitionLeaderboard',
  'seasonIds',
  'dogsTask',
  'result.competition = true',
]) {
  if (!warm.includes(token)) failures.push('Warm offline perdió Competencia: ' + token);
}

if (!pkg.includes('check:rango-1-client-competition-summary')) {
  failures.push('npm verify no incluye el guard del resumen cliente.');
}

if (failures.length) {
  console.error('RANGO 1 CLIENT COMPETITION SUMMARY FAIL:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Rango 1 client competition account + dog detail: PASS');
