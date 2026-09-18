import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 client competition: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const dog = read('src/app/(tabs)/dog.tsx');
const layout = read('src/app/client/_layout.tsx');
const screen = read('src/app/client/competition.tsx');
const service = read('src/services/client-competition.service.ts');
const warm = read('src/services/client-offline-sync.service.ts');
const pkg = read('package.json');

if (!/\/client\/competition\?dogId=/.test(dog)) {
  failures.push('Mi perro no abre Competencia con dogId.');
}
if (!/name=["']competition["']/.test(layout)) {
  failures.push('Client layout no registra competition.');
}

for (const token of [
  ".from('dogs')",
  ".eq('id', cleanDogId)",
  ".eq('user_id', userId)",
  ".from('ucapsa_competition_ranges')",
  ".eq('owner_user_id', userId)",
  ".from('ucapsa_exam_official_results')",
  "readClientResource",
  "writeClientResource",
  "competition-dog:",
]) {
  if (!service.includes(token)) failures.push(`Read model cliente perdió contrato: ${token}`);
}

const cacheIndex = screen.indexOf('getCachedMyDogCompetition');
const refreshIndex = screen.indexOf('refreshMyDogCompetition');
if (cacheIndex < 0 || refreshIndex < 0 || cacheIndex > refreshIndex) {
  failures.push('Competencia cliente debe hidratar cache antes del refresh remoto.');
}
if (!/setUsingSavedData\(true\)/.test(screen)) {
  failures.push('Competencia cliente perdió aviso de fallback real.');
}
const catchIndex = screen.indexOf('} catch (cause) {');
const fallbackIndex = screen.indexOf('setUsingSavedData(true)');
if (fallbackIndex < 0 || catchIndex < 0 || fallbackIndex < catchIndex) {
  failures.push('Competencia cliente no debe marcar datos guardados durante hidratación normal.');
}
if (!/OfflineDataNotice/.test(screen) || !/Mostrando competencia guardada/.test(screen)) {
  failures.push('Competencia cliente perdió aviso offline.');
}

for (const token of [
  'constancy_events_count',
  'required_exams_count',
  'missing_required_exams_count',
  'total_points_awarded',
  'max_points',
]) {
  if (!screen.includes(token)) failures.push(`Resumen cliente perdió dato útil: ${token}`);
}
for (const token of ['competitive_score', 'constancy_points', 'admin_adjustment_points']) {
  if (screen.includes(token)) failures.push(`Resumen cliente volvió a exponer profundidad competitiva: ${token}`);
}
for (const token of ['range_name', 'range_code', 'is_constancy_outstanding', 'last_event_date']) {
  if (!screen.includes(token)) failures.push(`Resumen cliente perdió dato útil de Constancia: ${token}`);
}
if (!/code === 'forming'/.test(screen) || !/suficiente población/.test(screen)) {
  failures.push('Resumen cliente debe soportar Constancia en formación sin inventar nivel comparativo.');
}
if (!/NIVEL DE CONSTANCIA/.test(screen)
  || !/actividades registradas/.test(screen)
  || !/última actividad/.test(screen)
  || !/Constancia sobresaliente/.test(screen)) {
  failures.push('Resumen cliente debe demostrar Nivel + actividad + última actividad sin mecánicas gamer.');
}
if (/constancy_percentile/.test(screen) || /Percentil desde la cima/.test(screen)) {
  failures.push('El percentil exacto pertenece al detalle, no al resumen Cliente.');
}
const constancyRouteCount = (screen.match(/competition-constancy\?dogId=/g) ?? []).length;
if (constancyRouteCount !== 1) {
  failures.push('Resumen Cliente debe tener una sola entrada útil a Constancia, sin tarjeta duplicada.');
}
if (!/competition-ranking\?seasonId=/.test(screen) || !/&dogId=/.test(screen)) {
  failures.push('Resumen cliente no abre Ranking con seasonId + dogId.');
}
if (/podium_medal|leaderboard_position|ucapsa_points_/i.test(screen)) {
  failures.push('Resumen cliente no puede inventar Podio persistido ni usar UCAPSA Points legado.');
}

for (const token of [
  "competition: boolean",
  "refreshMyDogCompetition",
  "refreshCompetitionLeaderboard",
  "seasonIds",
  "dogsTask",
  "result.competition = true",
]) {
  if (!warm.includes(token)) failures.push(`Warm offline perdió Competencia: ${token}`);
}

if (!pkg.includes('check:rango-1-client-competition-summary')) {
  failures.push('npm verify no incluye el guard del resumen cliente.');
}

if (failures.length) {
  console.error('RANGO 1 CLIENT COMPETITION SUMMARY FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 client competition summary: PASS');
