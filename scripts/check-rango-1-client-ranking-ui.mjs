import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 client ranking UI: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const layout = read('src/app/client/_layout.tsx');
const summary = read('src/app/client/competition.tsx');
const ranking = read('src/app/client/competition-ranking.tsx');
const service = read('src/services/client-competition.service.ts');
const warm = read('src/services/client-offline-sync.service.ts');
const pkg = read('package.json');

if (!/name=["']competition-ranking["']/.test(layout)) {
  failures.push('Client layout no registra competition-ranking.');
}
if (!/competition-ranking\?seasonId=/.test(summary) || !/&dogId=/.test(summary)) {
  failures.push('Resumen no abre Ranking con seasonId + dogId.');
}

for (const token of [
  "get_ucapsa_competition_leaderboard",
  "competition-leaderboard:",
  "getCachedCompetitionLeaderboard",
  "refreshCompetitionLeaderboard",
  "p_season_id: cleanSeasonId",
]) {
  if (!service.includes(token)) failures.push(`Servicio cliente Ranking perdió contrato: ${token}`);
}

const cacheIndex = ranking.indexOf('getCachedCompetitionLeaderboard');
const refreshIndex = ranking.indexOf('refreshCompetitionLeaderboard');
if (cacheIndex < 0 || refreshIndex < 0 || cacheIndex > refreshIndex) {
  failures.push('Ranking cliente debe hidratar cache antes del refresh remoto.');
}

const catchIndex = ranking.indexOf('} catch (cause) {');
const fallbackIndex = ranking.indexOf('setUsingSavedData(true)');
if (catchIndex < 0 || fallbackIndex < catchIndex) {
  failures.push('Ranking cliente sólo debe marcar saved-data después de fallo remoto.');
}

if (!/OfflineDataNotice/.test(ranking) || !/Mostrando Ranking guardado/.test(ranking)) {
  failures.push('Ranking cliente perdió aviso offline.');
}

for (const token of [
  'ranking_position',
  'competitive_score',
  'command_attendances_count',
  'exam_points',
  'range_name',
  'rows.slice(0, 3)',
  'row.dog_id === dogId',
  '🥇',
  '🥈',
  '🥉',
]) {
  if (!ranking.includes(token)) failures.push(`Ranking cliente perdió dato canónico: ${token}`);
}

if (/\.sort\(|row_number|dense_rank|percent_rank|competitive_score\s*[+\-*/]/.test(ranking)) {
  failures.push('Ranking cliente no debe recalcular orden, posición, percentiles ni score.');
}

if (!/puntaje total → Comandos → puntos de Exámenes → dog_id técnico/.test(ranking)) {
  failures.push('Ranking cliente dejó de explicar el desempate canónico.');
}

for (const token of ['refreshCompetitionLeaderboard', 'seasonIds', 'leaderboardResults']) {
  if (!warm.includes(token)) failures.push(`Warm offline perdió leaderboard por temporada: ${token}`);
}

if (/ucapsa_points_|get_ucapsa_points_leaderboard/.test(ranking + service)) {
  failures.push('Ranking cliente Rango 1 no puede depender del leaderboard legado.');
}

if (!pkg.includes('check:rango-1-client-ranking-ui')) {
  failures.push('npm verify no incluye guard de Ranking Cliente.');
}

if (failures.length) {
  console.error('RANGO 1 CLIENT RANKING UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 client ranking UI: PASS');
