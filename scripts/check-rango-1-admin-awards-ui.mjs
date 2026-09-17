import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 premios UI: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const hub = read('src/app/admin/competition.tsx');
const layout = read('src/app/admin/_layout.tsx');
const overview = read('src/app/admin/competition-awards.tsx');
const form = read('src/app/admin/competition-award-form.tsx');
const service = read('src/services/ucapsa-competition.service.ts');
const pkg = read('package.json');

if (!/title="Premios"[\s\S]{0,260}\/admin\/competition-awards/.test(hub)) {
  failures.push('Hub Competencia no abre Premios.');
}
for (const route of ['competition-awards', 'competition-award-form']) {
  if (!new RegExp(`name=["']${route}["']`).test(layout)) failures.push(`Admin layout no registra ${route}.`);
}

if (!/getAdminCompetitionAwardWorkspace/.test(overview) || !/getAdminCompetitionAwardWorkspace/.test(form)) {
  failures.push('Premios Admin dejó de consumir el workspace canónico.');
}
if (!/revokeCompetitionDogAward/.test(overview)) failures.push('Historial de premios perdió la revocación.');
if (!/grantCompetitionDogAward/.test(form)) failures.push('Formulario de premios perdió el otorgamiento.');
if (!/revoked_at/.test(overview) || !/Historial completo/.test(overview)) {
  failures.push('Admin debe poder ver premios revocados además de los vigentes.');
}
if (!/ownerName/.test(overview) || !/ownerName/.test(form)) {
  failures.push('Selector/historial de premios dejó de desambiguar perro por dueño.');
}
if (!/existingSeasonWinner/.test(form) || !/dog_of_year/.test(form)) {
  failures.push('Formulario dejó de bloquear un segundo Perro del Año vigente por temporada.');
}
if (!/awardRequiresSeason/.test(form)) {
  failures.push('Formulario dejó de respetar premios que requieren temporada.');
}
if (!/No se derivan del Ranking ni del Podio/.test(overview) || !/No se toma automáticamente del Ranking, Podio/.test(form)) {
  failures.push('La UI dejó de comunicar que premios no se derivan de Ranking/Podio.');
}

for (const token of [
  ".from('ucapsa_award_definitions')",
  ".from('dog_awards')",
  ".from('dogs')",
  ".from('profiles')",
  "admin_grant_ucapsa_dog_award",
  "admin_revoke_ucapsa_dog_award",
]) {
  if (!service.includes(token)) failures.push(`Servicio de premios perdió contrato canónico: ${token}`);
}

if (!/return awardCode === 'dog_of_year'/.test(service)) {
  failures.push('Servicio dejó de exigir temporada para Perro del Año.');
}
if (/leaderboard|rank_position|podium_medal|ucapsa_points_/i.test(service)) {
  failures.push('Premios permanentes no pueden depender de Ranking/Podio ni UCAPSA Points legado.');
}
if (/\.delete\(\)[\s\S]{0,250}dog_awards|from\(['"]dog_awards['"]\)[\s\S]{0,250}\.delete\(/.test(service)) {
  failures.push('Revocar un premio no puede borrar dog_awards.');
}
if (!pkg.includes('check:rango-1-admin-awards-ui')) {
  failures.push('npm verify no incluye el guard de Premios Admin UI.');
}

if (failures.length) {
  console.error('RANGO 1 ADMIN AWARDS UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 Admin awards UI: PASS');
