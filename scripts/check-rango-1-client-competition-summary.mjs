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
const seasonCatalog = read('src/services/client-competition-season.service.ts');
const pkg = read('package.json');

if (/Detalle competitivo|competition-dog\?dogId=/.test(dog)) {
  failures.push('Mis perros volvió a absorber el detalle de Competencia; debe vivir en las pantallas de Competencia.');
}
if (!/accessibilityLabel=["'`]Abrir ranking["'`]/.test(dog) || !/router\.push\('\/client\/competition'/.test(dog)) {
  failures.push('Mi perro perdió el acceso compacto al Ranking.');
}
if (!/name=["']competition["']/.test(layout) || !/name=["']competition-dog["']/.test(layout)) {
  failures.push('Client layout no registra Competencia de cuenta y detalle por perro.');
}

for (const token of [
  ".from('ucapsa_competition_seasons')",
  ".neq('status', 'draft')",
  "season_id: season.id",
]) {
  if (!seasonCatalog.includes(token)) failures.push('Temporadas deben leerse sin depender de actividad por perro: ' + token);
}
if (!accountService.includes('getPublishedCompetitionSeasons')) {
  failures.push('Cliente perdió el catálogo independiente de temporadas.');
}
if (!accountScreen.includes('next.seasons ?? getAccountCompetitionSeasons(next)')) {
  failures.push('Pantalla volvió a confundir temporada con resultados de perro.');
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

// El detalle ahora comparte la fuente de la cuenta; ambos caminos deben
// autenticar propietario y buscar al perro concreto, no aceptar ids ajenos.
const directOwnerQuery = [
  ".from('dogs')", ".eq('id', cleanDogId)", ".eq('user_id', userId)",
].every(token => dogService.includes(token));
const canonicalOwnerQuery = [
  "supabase.rpc('get_my_basic_dog_profile'",
  "p_dog_id: cleanDogId",
  ".eq('dog_id', cleanDogId)", ".eq('owner_user_id', userId)",
].every(token => dogService.includes(token));
if (!directOwnerQuery && !canonicalOwnerQuery) {
  failures.push('Detalle competitivo no valida pertenencia del perro por ruta directa o canónica.');
}
if (!dogService.includes('competition-dog:')) {
  failures.push('Detalle competitivo perdió su clave de cache aislada por perro.');
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

if (!/accessibilityLabel=["'`]Abrir ranking["'`]/.test(home) || !/router\.push\('\/client\/competition'/.test(home)) {
  failures.push('Inicio perdió el acceso compacto a Competencia de cuenta.');
}
if (!/CompetitionHomeCard/.test(homeCards) || !/rankingPosition/.test(homeCards)) {
  failures.push('Componente de resumen de Ranking perdió su contrato de datos reutilizable.');
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
