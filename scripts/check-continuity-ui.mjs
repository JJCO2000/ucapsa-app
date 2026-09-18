import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push('Falta archivo Continuidad: ' + rel);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const home = read('src/app/(tabs)/admin-home.tsx');
const layout = read('src/app/admin/_layout.tsx');
const admin = read('src/app/admin/continuity.tsx');
const summary = read('src/app/client/competition.tsx');
const detail = read('src/app/client/competition-constancy.tsx');
const service = read('src/services/continuity-evidence.service.ts');
const docs = read('docs/UCAPSA_CONTINUITY_EVIDENCE.md');
const pkg = read('package.json');

if (!/title="Continuidad"[\s\S]{0,220}\/admin\/continuity/.test(home)) {
  failures.push('Admin Home no expone Continuidad como módulo dedicado.');
}
if (!/name=["']continuity["']/.test(layout)) {
  failures.push('Admin layout no registra continuity.');
}

for (const token of [
  'record_ucapsa_value_exposure',
  'get_ucapsa_continuity_observations',
  'summarizeContinuity',
  "'constancy_summary'",
  "'constancy_detail'",
]) {
  if (!service.includes(token)) failures.push('Servicio Continuidad perdió contrato: ' + token);
}

if (!/recordValueExposure\(snapshot\.dog_id, selectedSeason\.season_id, 'constancy_summary'\)/.test(summary)) {
  failures.push('Resumen Cliente no registra exposición al Nivel de Constancia.');
}
if (!/recordValueExposure\(detail\.dog_id, season\.season_id, 'constancy_detail'\)/.test(detail)) {
  failures.push('Detalle Cliente no registra exposición a Constancia.');
}
if (!/\.catch\(\(\) => undefined\)/.test(summary) || !/\.catch\(\(\) => undefined\)/.test(detail)) {
  failures.push('Tracking de exposición debe ser no bloqueante para Cliente.');
}

for (const token of [
  'Lectura observacional',
  'Esto no demuestra causalidad',
  'Clientes observados',
  'Vieron su valor',
  'Actividad posterior',
  'Pago posterior',
  'Después de la primera exposición',
]) {
  if (!admin.includes(token)) failures.push('Admin Continuidad perdió evidencia/metodología: ' + token);
}

if (/risk score|churn score|riesgo alto|riesgo medio|riesgo bajo/i.test(admin + service)) {
  failures.push('Continuidad no debe introducir scoring de riesgo.');
}

if (!/cliente\/pagador \+ temporada/.test(docs)
  || !/no se crea una métrica ficticia de renovación/i.test(docs)
  || !/actividad posterior empieza al día siguiente/i.test(docs)) {
  failures.push('Documentación perdió unidad o límites metodológicos.');
}

if (!pkg.includes('check:continuity-ui')) {
  failures.push('npm verify no incluye guard UI de Continuidad.');
}

if (failures.length) {
  console.error('UCAPSA CONTINUITY UI FAIL:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('UCAPSA continuity UI: PASS');
