import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 exam attempts UI: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const layout = read('src/app/admin/_layout.tsx');
const examDetail = read('src/app/admin/competition-exam-detail.tsx');
const attempts = read('src/app/admin/competition-exam-attempts.tsx');
const attemptForm = read('src/app/admin/competition-exam-attempt-form.tsx');
const attemptDetail = read('src/app/admin/competition-exam-attempt-detail.tsx');
const resultForm = read('src/app/admin/competition-exam-result-form.tsx');
const service = read('src/services/ucapsa-competition.service.ts');
const pkg = read('package.json');

for (const route of [
  'competition-exam-attempts',
  'competition-exam-attempt-form',
  'competition-exam-attempt-detail',
  'competition-exam-result-form',
]) {
  if (!new RegExp(`name=["']${route}["']`).test(layout)) failures.push(`Admin layout no registra ${route}.`);
}

if (!/competition-exam-attempts\?examId=/.test(examDetail)) {
  failures.push('Detalle de examen no abre Intentos y resultados.');
}
if (!/getAdminCompetitionExamAttemptsWorkspace/.test(attempts)) {
  failures.push('Lista de intentos perdió el workspace canónico.');
}
if (!/import_batch_id/.test(attempts) || !/Importado/.test(attempts)) {
  failures.push('Lista de intentos dejó de distinguir intentos importados.');
}
if (!/exam\.status === 'published'/.test(attempts) || !/season\?\.status !== 'closed'/.test(attempts)) {
  failures.push('Alta manual dejó de exigir examen publicado y temporada mutable.');
}
if (!/ownerName/.test(attempts) || !/ownerName/.test(attemptForm)) {
  failures.push('Intentos dejó de desambiguar perro por dueño.');
}
if (!/America\/Mexico_City/.test(attemptForm) || !/-06:00/.test(attemptForm)) {
  failures.push('Captura manual dejó de fijar la hora de presentación al contexto CDMX.');
}

if (!/const imported = Boolean\(detail\?\.attempt\.import_batch_id\)/.test(attemptDetail)) {
  failures.push('Detalle dejó de bloquear manualmente intentos importados.');
}
if (!/detail\.attempt\.status === 'draft' && detail\.isComplete/.test(attemptDetail)) {
  failures.push('UI volvió a permitir revisar un intento incompleto.');
}
if (!/detail\.attempt\.status === 'reviewed' && detail\.isComplete/.test(attemptDetail)) {
  failures.push('UI volvió a permitir publicar un intento incompleto o sin revisar.');
}
if (!/publishCompetitionExamAttempt/.test(attemptDetail) || !/setCompetitionExamOfficialAttempt/.test(attemptDetail)) {
  failures.push('Detalle perdió publicación u oficialización explícita.');
}
if (!/voidCompetitionExamAttempt/.test(attemptDetail)) {
  failures.push('Detalle perdió anulación auditable.');
}
if (!/reviewed[\s\S]*incompleto/i.test(attemptDetail) || !/anularlo y capturar uno nuevo/i.test(attemptDetail)) {
  failures.push('Detalle dejó de explicar la salida segura para un reviewed incompleto heredado.');
}

if (!/value > max/.test(resultForm) || !/Supera el máximo/.test(resultForm)) {
  failures.push('Formulario de resultado dejó de validar points_awarded <= max_points antes del RPC.');
}
if (!/missingLocked/.test(resultForm) || !/status !== 'draft'/.test(resultForm)) {
  failures.push('Formulario volvió a permitir agregar una fila faltante después de draft.');
}
if (!/detail\.attempt\.status === 'draft'/.test(resultForm) || !/deleteCompetitionExamItemResult/.test(resultForm)) {
  failures.push('Eliminar una calificación debe quedar restringido a intentos draft.');
}

for (const token of [
  ".from('ucapsa_exam_attempt_summary')",
  ".from('ucapsa_exam_attempts')",
  ".from('ucapsa_exam_item_results')",
  "admin_create_ucapsa_exam_attempt",
  "admin_upsert_ucapsa_exam_item_result",
  "admin_delete_ucapsa_exam_item_result",
  "admin_review_ucapsa_exam_attempt",
  "admin_publish_ucapsa_exam_attempt",
  "admin_set_ucapsa_exam_official_attempt",
  "admin_void_ucapsa_exam_attempt",
]) {
  if (!service.includes(token)) failures.push(`Servicio de intentos perdió contrato canónico: ${token}`);
}

if (!/attempt:\s*CompetitionExamAttempt/.test(service)
  || !/\.from\('ucapsa_exam_attempts'\)/.test(service)
  || !/rawAttemptById/.test(service)
  || !/attempt\.import_batch_id/.test(attempts)) {
  failures.push('Servicio/UI dejó de conservar y consumir la procedencia por lote del intento.');
}
if (!/items\.length > 0 && validResults\.length === items\.length/.test(service)) {
  failures.push('Servicio dejó de derivar completitud por presencia de una fila por ejercicio.');
}

const manualAttemptsUi = [attempts, attemptForm, attemptDetail, resultForm].join('\n');
for (const forbidden of [
  'admin_create_ucapsa_exam_import_batch',
  'admin_validate_ucapsa_exam_import_batch',
  'admin_commit_ucapsa_exam_import_batch',
  'admin_review_ucapsa_exam_import_batch',
  'admin_publish_ucapsa_exam_import_batch',
  'admin_revert_ucapsa_exam_import_batch',
]) {
  if (manualAttemptsUi.includes(forbidden)) failures.push(`Las pantallas de intentos manuales no deben operar importaciones: ${forbidden}`);
}
if (/ucapsa_points_/.test(service)) failures.push('Intentos de examen no pueden depender de UCAPSA Points legado.');
if (!pkg.includes('check:rango-1-admin-exam-attempts-ui')) failures.push('npm verify no incluye guard de intentos/resultados.');

if (failures.length) {
  console.error('RANGO 1 ADMIN EXAM ATTEMPTS UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 Admin exam attempts UI: PASS');
