import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 ajustes UI: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const hub = read('src/app/admin/competition.tsx');
const layout = read('src/app/admin/_layout.tsx');
const overview = read('src/app/admin/competition-adjustments.tsx');
const detail = read('src/app/admin/competition-adjustment-detail.tsx');
const service = read('src/services/admin-competition-core.service.ts');
const pkg = read('package.json');

if (!/title="Puntos y ajustes"[\s\S]{0,260}\/admin\/competition-adjustments/.test(hub)) {
  failures.push('Hub Competencia no abre Puntos y ajustes.');
}
for (const route of ['competition-adjustments', 'competition-adjustment-detail']) {
  if (!new RegExp(`name=["']${route}["']`).test(layout)) failures.push(`Admin layout no registra ${route}.`);
}

if (!/getAdminCompetitionAdjustmentOverview/.test(overview)) failures.push('Resumen de ajustes no consume el servicio canónico.');
if (!/competition-adjustment-detail\?seasonId=/.test(overview) || !/&dogId=/.test(overview)) {
  failures.push('Resumen de ajustes perdió identidad dog_id + season_id.');
}
if (!/useLocalSearchParams/.test(detail) || !/seasonId/.test(detail) || !/dogId/.test(detail)) {
  failures.push('Detalle de ajustes no conserva dog_id + season_id.');
}
if (!/addCompetitionAdjustment/.test(detail) || !/reverseCompetitionAdjustment/.test(detail)) {
  failures.push('Detalle de ajustes perdió alta o reversión append-only.');
}
if (!/Append-only/.test(detail) || !/nunca se edita ni se borra/.test(detail)) {
  failures.push('UI dejó de explicar que los ajustes son append-only.');
}

for (const token of [
  ".from('ucapsa_competition_inputs')",
  ".from('ucapsa_competition_adjustments')",
  "admin_add_ucapsa_competition_adjustment",
  "admin_reverse_ucapsa_competition_adjustment",
]) {
  if (!service.includes(token)) failures.push(`Servicio de ajustes perdió contrato canónico: ${token}`);
}

if (!/season\.status === 'active' \|\| season\.status === 'reopened'/.test(service)) {
  failures.push('Servicio de ajustes dejó de limitar operación a temporadas active/reopened.');
}
if (/ucapsa_points_/.test(service) || /admin_adjust_ucapsa_points/.test(service)) {
  failures.push('La UI nueva de ajustes no puede depender del producto legado UCAPSA Points.');
}
if (/set[A-Za-z]*Total|totalPoints\s*=|update\(['"]ucapsa_competition_adjustments/.test(detail + service)) {
  failures.push('El total competitivo no debe volverse editable ni sobrescribirse.');
}
if (!pkg.includes('check:rango-1-admin-adjustments-ui')) {
  failures.push('npm verify no incluye el guard de ajustes Admin UI.');
}

if (failures.length) {
  console.error('RANGO 1 ADMIN ADJUSTMENTS UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 Admin adjustments UI: PASS');
