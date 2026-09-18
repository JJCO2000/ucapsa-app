import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 constancy UI: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const hub = read('src/app/admin/competition.tsx');
const layout = read('src/app/admin/_layout.tsx');
const overview = read('src/app/admin/competition-constancy.tsx');
const detail = read('src/app/admin/competition-constancy-detail.tsx');
const service = read('src/services/ucapsa-competition.service.ts');
const pkg = read('package.json');

for (const route of ['competition-constancy', 'competition-constancy-detail']) {
  if (!new RegExp(`name=["']${route}["']`).test(layout)) {
    failures.push(`Admin layout no registra ${route}.`);
  }
}

if (!/title="Rangos \/ Constancia"[\s\S]{0,360}\/admin\/competition-constancy/.test(hub)) {
  failures.push('Hub Competencia no abre Rangos / Constancia.');
}
if (!/status="Rango pendiente"/.test(hub)) {
  failures.push('Hub debe distinguir Constancia disponible de Rango todavía pendiente.');
}
if (!/Ranking[\s\S]{0,180}disabled/.test(hub)) {
  failures.push('Ranking debe seguir deshabilitado mientras no exista escala.');
}

if (!/getAdminCompetitionConstancyOverview/.test(overview)) {
  failures.push('Listado de Constancia no consume el read model canónico.');
}
if (!/competition-constancy-detail\?seasonId=/.test(overview) || !/&dogId=/.test(overview)) {
  failures.push('Navegación de Constancia perdió identidad season_id + dog_id.');
}
if (!/ownerName/.test(overview)) {
  failures.push('Listado dejó de desambiguar perros con el dueño.');
}
if (!/puntaje competitivo canónico/.test(overview)) {
  failures.push('UI dejó de explicar que el score es canónico y aún no es Ranking.');
}

if (!/useLocalSearchParams/.test(detail) || !/seasonId/.test(detail) || !/dogId/.test(detail)) {
  failures.push('Detalle de Constancia no conserva season_id + dog_id.');
}
if (!/PUNTAJE COMPETITIVO/.test(detail) || !/Rango pendiente de escala/.test(detail)) {
  failures.push('Detalle debe mostrar score canónico y mantener Rango pendiente.');
}
if (!/se corrige en la asistencia o visita de origen/.test(detail)) {
  failures.push('Detalle dejó de explicar que la corrección ocurre en el hecho origen.');
}

for (const token of [
  "export type CompetitionConstancyEvent",
  "getAdminCompetitionConstancyOverview",
  "getAdminCompetitionConstancyDetail",
  ".from('ucapsa_competition_scores')",
  ".from('ucapsa_constancy_events')",
  ".from('profiles')",
  ".eq('season_id', seasonId)",
  ".eq('dog_id', dogId)",
  ".order('dog_name', { ascending: true })",
]) {
  if (!service.includes(token)) failures.push(`Servicio de Constancia perdió contrato canónico: ${token}`);
}

const constancyUi = overview + '\n' + detail;
for (const token of ['competitive_score', 'constancy_points', 'exam_points', 'admin_adjustment_points']) {
  if (!constancyUi.includes(token)) failures.push(`Constancia Admin perdió componente de score: ${token}`);
}
if (/rank_position|podium_medal|leaderboard_position/i.test(constancyUi)) {
  failures.push('Constancia Admin todavía no debe inventar posición ni podio.');
}
if (/\.insert\(|\.update\(|\.delete\(|\.rpc\(/.test(constancyUi)) {
  failures.push('Las pantallas de Constancia deben ser sólo lectura.');
}

if (!pkg.includes('check:rango-1-admin-constancy-ui')) {
  failures.push('npm verify no incluye el guard de Constancia Admin.');
}

if (failures.length) {
  console.error('RANGO 1 ADMIN CONSTANCY UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 Admin constancy UI: PASS');
