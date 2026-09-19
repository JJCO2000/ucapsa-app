import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 admin ranking UI: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const hub = read('src/app/admin/competition.tsx');
const layout = read('src/app/admin/_layout.tsx');
const ranking = read('src/app/admin/competition-ranking.tsx');
const service = read('src/services/admin-competition-read.service.ts');
const pkg = read('package.json');

if (!/name=["']competition-ranking["']/.test(layout)) {
  failures.push('Admin layout no registra competition-ranking.');
}
if (!/title="Ranking"[\s\S]{0,260}\/admin\/competition-ranking/.test(hub)) {
  failures.push('Hub Competencia no abre Ranking.');
}
if (/title="Ranking"[\s\S]{0,180}disabled/.test(hub)) {
  failures.push('Ranking no debe volver a quedar disabled.');
}

for (const token of [
  'getAdminCompetitionRankingOverview',
  ".from('ucapsa_competition_leaderboard')",
  ".order('ranking_position', { ascending: true })",
]) {
  if (!service.includes(token)) failures.push(`Servicio Ranking perdió contrato: ${token}`);
}

for (const token of [
  'ranking_position',
  'competitive_score',
  'command_attendances_count',
  'exam_points',
  'range_name',
  'overview.rows.slice(0, 3)',
  '🥇',
  '🥈',
  '🥉',
]) {
  if (!ranking.includes(token)) failures.push(`Ranking Admin perdió dato canónico: ${token}`);
}

if (/\.sort\(|row_number|dense_rank|percent_rank|competitive_score\s*[+\-*/]/.test(ranking)) {
  failures.push('La UI de Ranking no debe recalcular orden, posiciones, percentiles ni score.');
}

if (!/Desempate: más asistencias a Comandos/.test(ranking)
  || !/más puntos de Exámenes/.test(ranking)
  || !/dog_id técnico/.test(ranking)) {
  failures.push('Ranking Admin dejó de explicar el desempate canónico.');
}

if (/ucapsa_points_|get_ucapsa_points_leaderboard/.test(ranking + service)) {
  failures.push('Ranking Rango 1 no puede depender del leaderboard legado.');
}

if (!pkg.includes('check:rango-1-admin-ranking-ui')) {
  failures.push('npm verify no incluye guard de Ranking Admin.');
}

if (failures.length) {
  console.error('RANGO 1 ADMIN RANKING UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 Admin ranking UI: PASS');
