import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const home = read('src/app/(tabs)/admin-home.tsx');
const more = read('src/app/(tabs)/admin-more.tsx');
const layout = read('src/app/admin/_layout.tsx');
const hub = read('src/app/admin/competition.tsx');
const seasons = read('src/app/admin/competition-seasons.tsx');
const detail = read('src/app/admin/competition-season-detail.tsx');
const form = read('src/app/admin/competition-season-form.tsx');
const service = [
  read('src/services/admin-competition-core.service.ts'),
  read('src/services/admin-competition-exams.service.ts'),
  read('src/services/admin-competition-read.service.ts'),
].join('\n');

if (!/\/admin\/competition/.test(home)) failures.push('Admin Home perdió la entrada única a Competencia UCAPSA.');
if (!/\/admin\/competition/.test(more)) failures.push('Admin Más perdió la entrada a Competencia UCAPSA.');
if (/\/admin\/points/.test(home) || /\/admin\/points/.test(more)) {
  failures.push('Los menús Admin no deben volver a enlazar el producto legado /admin/points.');
}

for (const route of ['competition', 'competition-seasons', 'competition-season-detail', 'competition-season-form']) {
  if (!new RegExp(`name=["']${route}["']`).test(layout)) failures.push(`Admin layout no registra ${route}.`);
}

for (const label of ['Ranking', 'Rangos / Constancia', 'Exámenes', 'Puntos y ajustes', 'Premios', 'Temporadas']) {
  if (!hub.includes(label)) failures.push(`Hub Competencia perdió la sección: ${label}`);
}

if (!/\/admin\/competition-seasons/.test(hub)) failures.push('Hub Competencia no baja a Temporadas.');
if (!/competition-season-detail\?seasonId=/.test(seasons)) failures.push('Temporadas no baja a ficha por seasonId.');
if (!/useLocalSearchParams/.test(detail) || !/seasonId/.test(detail)) failures.push('Ficha de temporada no consume seasonId.');
if (!/competition-season-form\?seasonId=/.test(detail)) failures.push('Ficha de temporada no baja a editar configuración.');
if (!/useLocalSearchParams/.test(form) || !/seasonId/.test(form)) failures.push('Formulario de temporada no resuelve create/edit por seasonId.');

for (const rpc of [
  'admin_create_ucapsa_competition_season',
  'admin_update_ucapsa_competition_season',
  'admin_activate_ucapsa_competition_season',
  'admin_close_ucapsa_competition_season',
  'admin_reopen_ucapsa_competition_season',
]) {
  if (!service.includes(rpc)) failures.push(`Servicio Competencia no usa RPC canónico: ${rpc}`);
}

if (/ucapsa_points_/.test(service) || /get_ucapsa_points_leaderboard/.test(service)) {
  failures.push('El servicio nuevo de Competencia no puede depender del modelo legado ucapsa_points_*.');
}

if (failures.length) {
  console.error('RANGO 1 ADMIN COMPETITION UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 Admin competition navigation: PASS');
