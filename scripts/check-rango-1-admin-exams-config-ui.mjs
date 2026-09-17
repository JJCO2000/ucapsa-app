import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Falta archivo Rango 1 exam config UI: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const hub = read('src/app/admin/competition.tsx');
const layout = read('src/app/admin/_layout.tsx');
const list = read('src/app/admin/competition-exams.tsx');
const detail = read('src/app/admin/competition-exam-detail.tsx');
const form = read('src/app/admin/competition-exam-form.tsx');
const itemForm = read('src/app/admin/competition-exam-item-form.tsx');
const service = read('src/services/ucapsa-competition.service.ts');
const pkg = read('package.json');

if (!/title="Exámenes"[\s\S]{0,260}\/admin\/competition-exams/.test(hub)) {
  failures.push('Hub Competencia no abre Exámenes.');
}
for (const route of ['competition-exams', 'competition-exam-detail', 'competition-exam-form', 'competition-exam-item-form']) {
  if (!new RegExp(`name=["']${route}["']`).test(layout)) failures.push(`Admin layout no registra ${route}.`);
}

if (!/getAdminCompetitionExamWorkspace/.test(list)) failures.push('Catálogo de exámenes perdió el workspace canónico.');
if (!/getAdminCompetitionExamDetail/.test(detail)) failures.push('Detalle de examen perdió la lectura canónica.');
if (!/structureLocked/.test(detail) || !/seasonClosed/.test(detail)) {
  failures.push('Detalle dejó de distinguir lock estructural y temporada cerrada.');
}
if (!/detail\.items\.length > 0/.test(detail) || !/publishCompetitionExam/.test(detail)) {
  failures.push('Publicación desde UI debe exigir al menos un ejercicio.');
}
if (!/createCompetitionExam/.test(form) || !/updateCompetitionExam/.test(form)) {
  failures.push('Formulario de examen perdió crear/actualizar.');
}
if (!/existingExam\?\.status === 'draft'/.test(form)) {
  failures.push('Código del examen dejó de quedar fijo después de publicar.');
}
if (!/No calcula Ranking ni posiciones/.test(form)) {
  failures.push('UI debe dejar claro que required_for_ranking no calcula Ranking.');
}
if (!/addCompetitionExamItem/.test(itemForm) || !/updateCompetitionExamItem/.test(itemForm)) {
  failures.push('Formulario de ejercicios perdió alta/edición.');
}
if (!/deleteCompetitionExamItem/.test(detail)) failures.push('Detalle perdió eliminación controlada de ejercicio.');

for (const token of [
  ".from('ucapsa_exams')",
  ".from('ucapsa_exam_items')",
  "admin_create_ucapsa_exam",
  "admin_update_ucapsa_exam",
  "admin_publish_ucapsa_exam",
  "admin_add_ucapsa_exam_item",
  "admin_update_ucapsa_exam_item",
  "admin_delete_ucapsa_exam_item",
]) {
  if (!service.includes(token)) failures.push(`Servicio de configuración de exámenes perdió contrato: ${token}`);
}

if (!/\.from\('ucapsa_exam_attempts'\)[\s\S]{0,350}\.select\('id'\)[\s\S]{0,350}reviewed[\s\S]{0,100}published/.test(service)) {
  failures.push('Detalle dejó de leer intentos bloqueados sólo para decidir mutabilidad estructural.');
}

const configUi = [list, detail, form, itemForm].join('\n');
for (const forbidden of [
  'admin_create_ucapsa_exam_attempt',
  'admin_upsert_ucapsa_exam_item_result',
  'admin_review_ucapsa_exam_attempt',
  'admin_publish_ucapsa_exam_attempt',
  'admin_create_ucapsa_exam_import_batch',
  'admin_commit_ucapsa_exam_import_batch',
]) {
  if (configUi.includes(forbidden)) failures.push(`Las pantallas de configuración no deben operar intentos/importación: ${forbidden}`);
}
if (/ucapsa_points_/.test(service)) failures.push('Configuración de exámenes no puede depender de UCAPSA Points legado.');
if (!pkg.includes('check:rango-1-admin-exams-config-ui')) failures.push('npm verify no incluye guard de configuración de exámenes.');

if (failures.length) {
  console.error('RANGO 1 ADMIN EXAMS CONFIG UI FAIL:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rango 1 Admin exams config UI: PASS');
