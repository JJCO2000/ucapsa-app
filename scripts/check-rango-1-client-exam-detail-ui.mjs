import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 client exam detail: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const layout = read('src/app/client/_layout.tsx');
const summary = read('src/app/client/competition.tsx');
const detail = read('src/app/client/competition-exam-result.tsx');
const service = read('src/services/client-competition.service.ts');
const pkg = read('package.json');

if (!/name=["']competition-exam-result["']/.test(layout)) {
  failures.push('Client layout no registra competition-exam-result.');
}
if (!/competition-exam-result\?dogId=/.test(summary) || !/&attemptId=/.test(summary)) {
  failures.push('Resumen de competencia perdió navegación dogId + attemptId.');
}
if (!/if \(!exam\.attempt_id\) return/.test(summary)) {
  failures.push('Resumen no debe abrir un resultado sin attempt_id oficial.');
}

for (const token of [
  "ClientOfficialExamDetail",
  "competition-exam:",
  ".from('dogs')",
  ".eq('user_id', userId)",
  ".from('ucapsa_exam_official_results')",
  ".eq('dog_id', cleanDogId)",
  ".eq('attempt_id', cleanAttemptId)",
  ".from('ucapsa_exam_items')",
  ".from('ucapsa_exam_item_results')",
  "getCachedMyOfficialExamDetail",
  "refreshMyOfficialExamDetail",
]) {
  if (!service.includes(token)) failures.push(`Servicio de detalle perdió contrato: ${token}`);
}

const cacheIndex = detail.indexOf('getCachedMyOfficialExamDetail');
const refreshIndex = detail.indexOf('refreshMyOfficialExamDetail');
if (cacheIndex < 0 || refreshIndex < 0 || cacheIndex > refreshIndex) {
  failures.push('Detalle de examen debe hidratar cache antes del refresh remoto.');
}
const catchIndex = detail.indexOf('} catch (cause) {');
const fallbackIndex = detail.indexOf('setUsingSavedData(true)');
if (catchIndex < 0 || fallbackIndex < catchIndex) {
  failures.push('Detalle de examen sólo debe marcar saved-data después de fallo remoto.');
}
if (!/OfflineDataNotice/.test(detail) || !/Mostrando resultado guardado/.test(detail)) {
  failures.push('Detalle de examen perdió aviso offline.');
}

if (!/detail\.official\.total_points_awarded/.test(detail) || !/detail\.official\.max_points/.test(detail)) {
  failures.push('Detalle debe mostrar el total oficial publicado.');
}
if (/\.reduce\(|totalPoints|sum\(/.test(detail)) {
  failures.push('Detalle cliente no debe recalcular un total paralelo.');
}
if (!/resultByItem/.test(detail) || !/points_awarded/.test(detail) || !/item\.max_points/.test(detail)) {
  failures.push('Detalle perdió desglose por ejercicio.');
}
if (/evaluator_note/.test(detail)) {
  failures.push('Detalle cliente no debe exponer notas internas del evaluador.');
}
if (/competitive_score|rank_position|podium_medal|ucapsa_points_/i.test(detail)) {
  failures.push('La pantalla de detalle de examen no puede introducir score/ranking/podio ni UCAPSA Points legado.');
}

if (!pkg.includes('check:rango-1-client-exam-detail-ui')) {
  failures.push('npm verify no incluye guard de detalle de examen.');
}

if (failures.length) {
  console.error('RANGO 1 CLIENT EXAM DETAIL UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 client exam detail UI: PASS');
