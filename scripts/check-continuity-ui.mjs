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
const outbox = read('src/services/value-exposure-outbox.service.ts');
const offline = read('src/services/client-offline-sync.service.ts');
const docs = read('docs/UCAPSA_CONTINUITY_EVIDENCE.md');
const pkg = read('package.json');

if (!/title="Continuidad"[\s\S]{0,220}\/admin\/continuity/.test(home)) {
  failures.push('Admin Home no expone Continuidad como módulo dedicado.');
}
if (!/name=["']continuity["']/.test(layout)) {
  failures.push('Admin layout no registra continuity.');
}

for (const token of [
  'get_ucapsa_continuity_observations',
  'summarizeContinuity',
  'summarizeContinuityWindow',
  'summarizeContinuityCohort30',
  'recordValueExposureDurably',
]) {
  if (!service.includes(token)) failures.push('Servicio Continuidad perdió contrato: ' + token);
}

if (!/recordValueExposure\(user\.id, snapshot\.dog_id, selectedSeason\.season_id!, 'constancy_summary'\)/.test(summary)) {
  failures.push('Resumen Cliente no registra exposición durable al Nivel de Constancia.');
}
if (!/setTimeout\([\s\S]{0,260}750/.test(summary) || !/screenFocused/.test(summary)) {
  failures.push('Resumen Cliente debe exigir foco estable durante 750 ms antes de registrar exposición.');
}
if (!/recordValueExposure\(user\.id, detail\.dog_id, season\.season_id, 'constancy_detail'\)/.test(detail)) {
  failures.push('Detalle Cliente no registra apertura durable de Constancia.');
}
if (
  !/void recordValueExposure[\s\S]{0,360}\.catch\(/.test(summary)
  || !summary.includes('Could not persist constancy summary value exposure.')
  || !/void recordValueExposure[\s\S]{0,360}\.catch\(/.test(detail)
  || !detail.includes('Could not persist constancy detail value exposure.')
) {
  failures.push('Tracking de exposición debe seguir no bloqueante y observable para Cliente.');
}

for (const token of [
  'Lectura observacional',
  'Esto no demuestra causalidad',
  'Clientes observados',
  'Exposición registrada',
  'Actividad posterior',
  'Mensualidad posterior',
  'Ventana después de exposición',
  'Comparación 30 días',
  'Exposición temprana',
  'Sin exposición temprana',
  'Después de la primera exposición',
]) {
  if (!admin.includes(token)) failures.push('Admin Continuidad perdió evidencia/metodología: ' + token);
}

for (const token of [
  'ucapsa:value-exposure-outbox:v1:',
  'queueValueExposure',
  'recordValueExposureDurably',
  'flushPendingValueExposures',
  "surface: ValueExposureSurface",
  "'constancy_summary'",
  "'constancy_detail'",
  "supabase.rpc('record_ucapsa_value_exposure'",
  'p_occurred_at: operation.occurredAt',
]) {
  if (!outbox.includes(token)) failures.push('Outbox de exposición perdió contrato: ' + token);
}
for (const token of ['flushPendingValueExposures', 'valueExposureOutbox']) {
  if (!offline.includes(token)) failures.push('Sync offline no vacía exposiciones pendientes: ' + token);
}
if (!/recordValueExposureDurably/.test(service)) {
  failures.push('Servicio Continuidad debe guardar localmente antes de sincronizar.');
}

if (/risk score|churn score|riesgo alto|riesgo medio|riesgo bajo/i.test(admin + service)) {
  failures.push('Continuidad no debe introducir scoring de riesgo.');
}

if (!/cliente\/pagador \+ temporada/.test(docs)
  || !/no se crea una métrica ficticia de renovación/i.test(docs)
  || !/actividad posterior empieza al día siguiente/i.test(docs)
  || !/750 ms/.test(docs)
  || !/outbox local durable/.test(docs)
  || !/primeros \*\*7 días\*\*/.test(docs)
  || !/\*\*37 días\*\*/.test(docs)) {
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
