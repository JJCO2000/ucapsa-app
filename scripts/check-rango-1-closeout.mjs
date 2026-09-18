import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push('Falta artefacto de cierre Rango 1: ' + rel);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const doc = read('docs/UCAPSA_RANGO_1.md');
const adminHub = read('src/app/admin/competition.tsx');
const adminRanking = read('src/app/admin/competition-ranking.tsx');
const adminConstancy = read('src/app/admin/competition-constancy.tsx');
const clientSummary = read('src/app/client/competition.tsx');
const clientRanking = read('src/app/client/competition-ranking.tsx');
const clientConstancy = read('src/app/client/competition-constancy.tsx');
const scoreSql = read('supabase/sql/ucapsa-rango-1-competitive-score.sql');
const rankingSql = read('supabase/sql/ucapsa-rango-1-ranking-ranges.sql');
const services = read('src/app/(tabs)/services.tsx');
const legacyClientPoints = read('src/app/client/points.tsx');
const legacyAdminPoints = read('src/app/admin/points.tsx');
const legacyPointsRetirementSql = read('supabase/sql/ucapsa-legacy-points-retirement.sql');
const pkg = read('package.json');

if (!/Rango 1 funcionalmente cerrado/.test(doc)) {
  failures.push('Roadmap no marca Rango 1 como funcionalmente cerrado.');
}

for (const token of [
  '/admin/competition-ranking',
  '/admin/competition-constancy',
  '/admin/competition-exams',
  '/admin/competition-adjustments',
  '/admin/competition-awards',
  '/admin/competition-seasons',
]) {
  if (!adminHub.includes(token)) failures.push('Hub Admin perdió entrada: ' + token);
}

if (/Escala pendiente|Rango pendiente/.test(adminHub + adminConstancy + clientSummary + clientConstancy)) {
  failures.push('Reapareció un marcador de escala/rango pendiente en Competencia final.');
}
if (/title="Ranking"[\s\S]{0,180}disabled/.test(adminHub)) {
  failures.push('Ranking Admin volvió a quedar deshabilitado.');
}

for (const token of [
  'competitive_score',
  'command_attendances_count',
  'exam_points',
  'ranking_position',
  'range_name',
]) {
  if (!adminRanking.includes(token)) failures.push('Ranking Admin perdió dato canónico: ' + token);
  if (!clientRanking.includes(token)) failures.push('Ranking Cliente perdió dato canónico: ' + token);
}

if (!/rows\.slice\(0, 3\)/.test(clientRanking)
  || !/overview\.rows\.slice\(0, 3\)/.test(adminRanking)) {
  failures.push('Podio dejó de derivarse como top 3 del Ranking.');
}

if (!/ucapsa_competition_scores/.test(scoreSql)
  || !/ucapsa_competition_ranges/.test(rankingSql)
  || !/ucapsa_competition_leaderboard/.test(rankingSql)) {
  failures.push('SQL canónico de score/rango/ranking incompleto.');
}

const competitionSurface = [
  adminHub,
  adminRanking,
  adminConstancy,
  clientSummary,
  clientRanking,
  clientConstancy,
].join('\n');

if (/ucapsa_points_|get_ucapsa_points_leaderboard/.test(competitionSurface)) {
  failures.push('Competencia Rango 1 volvió a depender del sistema legado UCAPSA Points.');
}

if (services.includes('/client/points')) {
  failures.push('Servicios volvió a abrir la pantalla histórica UCAPSA Points.');
}
if (!/Redirect/.test(legacyClientPoints) || !legacyClientPoints.includes("'/dog'") || /ucapsa-points\.service/.test(legacyClientPoints)) {
  failures.push('La ruta cliente histórica /client/points dejó de redirigir al flujo canónico por perro.');
}
if (!/Redirect/.test(legacyAdminPoints) || !legacyAdminPoints.includes('/admin/competition-adjustments') || /ucapsa-points\.service/.test(legacyAdminPoints)) {
  failures.push('La ruta Admin histórica /admin/points dejó de redirigir a Ajustes canónicos.');
}
if (!/drop trigger if exists award_ucapsa_point_after_program_attendance[\s\S]*on public\.program_attendances/i.test(legacyPointsRetirementSql)) {
  failures.push('El trigger automático del sistema legado UCAPSA Points volvió a quedar activo en el contrato SQL.');
}
if (!/revoke all on function public\.admin_adjust_ucapsa_points\(uuid, uuid, integer, text\)[\s\S]*from public, anon, authenticated/i.test(legacyPointsRetirementSql)) {
  failures.push('El RPC de escritura del sistema legado UCAPSA Points volvió a quedar accesible.');
}

if (!pkg.includes('check:rango-1-closeout')) {
  failures.push('npm verify no incluye guard de cierre Rango 1.');
}

if (failures.length) {
  console.error('RANGO 1 CLOSEOUT FAIL:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Rango 1 closeout: PASS');
