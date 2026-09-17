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
if (!/Esta pantalla no ordena perros por “mejor constancia”/.test(overview)) {
  failures.push('UI dejó de declarar que Constancia no es un ranking.');
}

if (!/useLocalSearchParams/.test(detail) || !/seasonId/.test(detail) || !/dogId/.test(detail)) {
  failures.push('Detalle de Constancia no conserva season_id + dog_id.');
}
if (!/Pendiente de escala/.test(detail)) {
  failures.push('Detalle debe mantener el Rango sin calcular hasta definir escala.');
}
if (!/se corrige en la asistencia o visita de origen/.test(detail)) {
  failures.push('Detalle dejó de explicar que la corrección ocurre en el hecho origen.');
}

for (const token of [
  "export type CompetitionConstancyEvent",
  "getAdminCompetitionConstancyOverview",
  "getAdminCompetitionConstancyDetail",
  ".from('ucapsa_competition_inputs')",
  ".from('ucapsa_constancy_events')",
  ".from('profiles')",
  ".eq('season_id', seasonId)",
  ".eq('dog_id', dogId)",
  ".order('dog_name', { ascending: true })",
]) {
  if (!service.includes(token)) failures.push(`Servicio de Constancia perdió contrato canónico: ${token}`);
}

const constancyUi = overview + '\n' + detail;
if (/competitive_score|rank_position|podium_medal|leaderboard_position|total_points/i.test(constancyUi)) {
  failures.push('Constancia Admin no puede inventar score, posición, podio ni total competitivo.');
}
if (/admin_adjustment_points|official_exam_points_awarded|required_exam_points_awarded/.test(constancyUi)) {
  failures.push('Constancia Admin no debe mezclar Exámenes/Ajustes en una pseudo-fórmula.');
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
