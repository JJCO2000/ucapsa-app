import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 client constancy detail: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const layout = read('src/app/client/_layout.tsx');
const summary = read('src/app/client/competition-dog.tsx');
const detail = read('src/app/client/competition-constancy.tsx');
const service = read('src/services/client-competition-constancy.service.ts');
const pkg = read('package.json');

if (!/name=["']competition-constancy["']/.test(layout)) {
  failures.push('Client layout no registra competition-constancy.');
}
if (!/competition-constancy\?dogId=/.test(summary) || !/&seasonId=/.test(summary)) {
  failures.push('Resumen perdió navegación dogId + seasonId a Constancia.');
}

for (const token of [
  "ClientConstancyDetail",
  "competition-constancy:",
  ".from('dogs')",
  ".eq('user_id', userId)",
  ".from('ucapsa_competition_ranges')",
  ".eq('owner_user_id', userId)",
  ".from('ucapsa_constancy_events')",
  ".eq('dog_id', cleanDogId)",
  ".eq('season_id', cleanSeasonId)",
  "getCachedMyConstancyDetail",
  "refreshMyConstancyDetail",
]) {
  if (!service.includes(token)) failures.push(`Servicio de Constancia cliente perdió contrato: ${token}`);
}

const cacheIndex = detail.indexOf('getCachedMyConstancyDetail');
const refreshIndex = detail.indexOf('refreshMyConstancyDetail');
if (cacheIndex < 0 || refreshIndex < 0 || cacheIndex > refreshIndex) {
  failures.push('Constancia cliente debe hidratar cache antes del refresh remoto.');
}
const catchIndex = detail.indexOf('} catch (cause) {');
const fallbackIndex = detail.indexOf('setUsingSavedData(true)');
if (catchIndex < 0 || fallbackIndex < catchIndex) {
  failures.push('Constancia cliente sólo debe marcar saved-data después de fallo remoto.');
}
if (!/OfflineDataNotice/.test(detail) || !/Mostrando constancia guardada/.test(detail)) {
  failures.push('Constancia cliente perdió aviso offline.');
}

for (const token of [
  'constancy_events_count',
  'command_attendances_count',
  'member_visits_count',
  'first_event_date',
  'last_event_date',
  'command_attendance',
  'member_visit',
]) {
  if (!detail.includes(token)) failures.push(`Detalle de Constancia perdió dato canónico: ${token}`);
}
for (const token of ['range_name', 'constancy_percentile', 'is_constancy_outstanding', 'has_sufficient_constancy_population']) {
  if (!detail.includes(token)) failures.push(`Detalle de Constancia perdió dato de Nivel: ${token}`);
}
if (!/suficiente población/.test(detail) || !/actividades registradas/.test(detail)) {
  failures.push('Detalle debe mostrar Constancia en formación cuando la muestra es insuficiente.');
}
if (!/NIVEL DE CONSTANCIA/.test(detail) || !/permanece en Cobre/.test(detail)) {
  failures.push('Detalle debe conservar Nivel de Constancia y regla 0 actividad → Cobre.');
}
if (!/Cobre = constancia en desarrollo/.test(detail)
  || !/Plata = constancia sostenida/.test(detail)
  || !/Oro = constancia destacada/.test(detail)) {
  failures.push('Detalle debe explicar los tres niveles públicos.');
}
if (!/Constancia sobresaliente · top 5%/.test(detail)) {
  failures.push('Detalle perdió la distinción top 5% de Constancia sobresaliente.');
}
if (/\bXP\b|Cobre\s+[IVX]+|Plata\s+[IVX]+|Oro\s+[IVX]+/i.test(summary + detail)) {
  failures.push('Cliente Constancia no debe introducir XP ni subniveles tipo videojuego.');
}
if (/90\s*d[ií]as|100\s*d[ií]as|decay/i.test(summary + detail)) {
  failures.push('Cliente Constancia no debe imponer decay por días sin regla validada.');
}
if (/podium_medal|leaderboard_position|ucapsa_points_/i.test(detail)) {
  failures.push('Constancia cliente no puede introducir Podio persistido ni UCAPSA Points legado.');
}
if (/\.insert\(|\.update\(|\.delete\(|\.rpc\(/.test(detail)) {
  failures.push('Pantalla cliente de Constancia debe ser sólo lectura.');
}

if (!pkg.includes('check:rango-1-client-constancy-detail-ui')) {
  failures.push('npm verify no incluye guard de Constancia cliente.');
}

if (failures.length) {
  console.error('RANGO 1 CLIENT CONSTANCY DETAIL UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 client constancy detail UI: PASS');
