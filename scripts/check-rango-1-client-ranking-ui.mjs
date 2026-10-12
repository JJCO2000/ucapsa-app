import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push('Falta archivo Rango 1 client ranking UI: ' + rel);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const layout = read('src/app/client/_layout.tsx');
const summary = read('src/app/client/competition.tsx');
const ranking = read('src/app/client/competition-ranking.tsx');
const service = read('src/services/client-competition-ranking.service.ts');
const warm = read('src/services/client-offline-sync.service.ts');
const pkg = read('package.json');

if (!/name=["']competition-ranking["']/.test(layout)) {
  failures.push('Client layout no registra competition-ranking.');
}
if (!/competition-ranking\?seasonId=/.test(summary)) {
  failures.push('Competencia de cuenta no abre Ranking con seasonId.');
}
if (/competition-ranking\?seasonId=[\s\S]{0,220}&dogId=/.test(summary)) {
  failures.push('Competencia de cuenta volvió a acoplar Ranking a un solo perro.');
}

for (const token of [
  'get_ucapsa_competition_leaderboard',
  'competition-leaderboard:',
  'getCachedCompetitionLeaderboard',
  'refreshCompetitionLeaderboard',
  'p_season_id: cleanSeasonId',
]) {
  if (!service.includes(token)) failures.push('Servicio cliente Ranking perdió contrato: ' + token);
}

for (const token of [
  'getCachedRequiredCompetitionExams',
  'refreshRequiredCompetitionExams',
  'missingExamExplanation',
  'requiredExams',
  'pinnedFooter',
  'footerDogs',
  'Sin clasificados',
  'Examen obligatorio pendiente:',
]) {
  if (!ranking.includes(token)) failures.push('Ranking debe mostrar elegibilidad y pie con posición: ' + token);
}
const requiredService = read('src/services/client-competition-required-exams.service.ts');
for (const token of [".eq('status', 'published')", ".eq('is_required_for_ranking', true)", 'readClientResource', 'writeClientResource']) {
  if (!requiredService.includes(token)) failures.push('Checklist de exámenes requeridos perdió seguridad/cache: ' + token);
}
if (!summary.includes('Puedes consultar el Ranking aunque todavía no tengas perros registrados.')) {
  failures.push('Ranking debe estar disponible incluso sin perros propios.');
}

const cacheIndex = ranking.indexOf('getCachedCompetitionLeaderboard');
const refreshIndex = ranking.indexOf('refreshCompetitionLeaderboard');
if (cacheIndex < 0 || refreshIndex < 0 || cacheIndex > refreshIndex) {
  failures.push('Ranking cliente debe hidratar cache antes del refresh remoto.');
}

for (const token of [
  'refreshMyCompetitionAccount',
  'accountResult',
  'season.competitive_score',
  'Puntos acumulados de tus perros',
  'SIN POSICIÓN OFICIAL',
]) {
  if (!ranking.includes(token)) failures.push('Ranking debe mostrar puntos antes de elegibilidad: ' + token);
}
for (const token of [
  'numberLabel(season.competitive_score)',
  'Sin posiciones oficiales todavía',
]) {
  if (!summary.includes(token)) failures.push('Resumen debe mostrar puntaje sin ranking: ' + token);
}
const dogDetail = read('src/app/client/competition-dog.tsx');
if (!dogDetail.includes('puntos acumulados')) {
  failures.push('Detalle del perro debe mostrar puntaje acumulado.');
}

const fallbackIndex = ranking.indexOf('setUsingSavedData(true)');
if (fallbackIndex < 0) {
  failures.push('Ranking cliente perdió fallback de datos guardados.');
}

if (!/OfflineDataNotice/.test(ranking) || !/(?:Mostrando Ranking guardado|Mostrando datos competitivos guardados)/.test(ranking)) {
  failures.push('Ranking cliente perdió aviso offline.');
}

for (const token of [
  'ranking_position',
  'competitive_score',
  'command_attendances_count',
  'exam_points',
  'range_name',
  'rows.slice(0, 3)',
  'myDogIds.has(row.dog_id)',
  'Tus perros',
  'Tuyo',
  '🥇',
  '🥈',
  '🥉',
]) {
  if (!ranking.includes(token)) failures.push('Ranking cliente perdió dato/identidad canónica: ' + token);
}

// La distribución visual 2-1-3 nunca reordena ni recalcula la clasificación
// original; fotos privadas siguen resolviéndose únicamente para perros propios.
for (const token of [
  'const podiumDisplay = [podium[1], podium[0], podium[2]]',
  'podiumDisplay.map((row)',
  'position === 1 && styles.podiumChampion',
  'position === 1 ? 52 : 42',
  'podiumPedestalChampion',
  'mine && row.dog_id ? myDogs.find',
  'const podium = rows.slice(0, 3)',
]) {
  if (!ranking.includes(token)) failures.push('Podio visual perdió regla de datos o privacidad: ' + token);
}

if (/row\.dog_id === dogId/.test(ranking)) {
  failures.push('Ranking volvió a reconocer sólo un perro como propio.');
}
if (/\.sort\(|row_number|dense_rank|percent_rank|competitive_score\s*[+\-*/]/.test(ranking)) {
  failures.push('Ranking cliente no debe recalcular orden, posición, percentiles ni score.');
}

if (!/puntaje total → Comandos → puntos de Exámenes → dog_id técnico/.test(ranking)) {
  failures.push('Ranking cliente dejó de explicar el desempate canónico.');
}

for (const token of ['refreshCompetitionLeaderboard', 'seasonIds', 'leaderboardResults']) {
  if (!warm.includes(token)) failures.push('Warm offline perdió leaderboard por temporada: ' + token);
}

if (/ucapsa_points_|get_ucapsa_points_leaderboard/.test(ranking + service)) {
  failures.push('Ranking cliente Rango 1 no puede depender del leaderboard legado.');
}

if (!pkg.includes('check:rango-1-client-ranking-ui')) {
  failures.push('npm verify no incluye guard de Ranking Cliente.');
}

if (failures.length) {
  console.error('RANGO 1 CLIENT RANKING UI FAIL:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Rango 1 client account ranking UI: PASS');
