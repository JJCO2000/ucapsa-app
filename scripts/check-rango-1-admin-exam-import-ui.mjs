import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push('Falta archivo Rango 1 exam import UI: ' + rel);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const pkg = JSON.parse(read('package.json') || '{}');
const lock = JSON.parse(read('package-lock.json') || '{}');
const layout = read('src/app/admin/_layout.tsx');
const examDetail = read('src/app/admin/competition-exam-detail.tsx');
const imports = read('src/app/admin/competition-exam-imports.tsx');
const importDetail = read('src/app/admin/competition-exam-import-detail.tsx');
const parser = read('src/services/ucapsa-exam-xlsx.ts');
const service = read('src/services/ucapsa-competition.service.ts');

for (const pair of [
  ['expo-file-system', '~57.0.7'],
  ['fflate', '^0.8.3'],
]) {
  const name = pair[0];
  const expected = pair[1];
  if (pkg.dependencies?.[name] !== expected) failures.push('package.json perdió ' + name + '@' + expected + '.');
  if (lock.packages?.['']?.dependencies?.[name] !== expected) failures.push('package-lock raíz perdió ' + name + '@' + expected + '.');
}

const xmldomRange = pkg.dependencies?.['@xmldom/xmldom'];
if (!xmldomRange) failures.push('package.json perdió @xmldom/xmldom.');
if (lock.packages?.['']?.dependencies?.['@xmldom/xmldom'] !== xmldomRange) {
  failures.push('package-lock raíz no coincide con el rango declarado de @xmldom/xmldom.');
}

const fflateLock = lock.packages?.['node_modules/fflate'];
if (fflateLock?.version !== '0.8.3'
  || fflateLock?.integrity !== 'sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==') {
  failures.push('package-lock no fija fflate 0.8.3 con la integridad esperada.');
}

for (const token of [
  "from '@xmldom/xmldom'",
  "from 'expo-file-system'",
  "from 'fflate'",
  'File.pickFileAsync',
  'file.bytes()',
  'unzipSync',
  'xl/workbook.xml',
  'xl/sharedStrings.xml',
  'Identificador',
  'Perro',
  'Columnas no reconocidas',
  'Faltan columnas para',
  "endsWith('.xlsx')",
]) {
  if (!parser.includes(token)) failures.push('Parser XLSX perdió contrato: ' + token);
}

for (const route of ['competition-exam-imports', 'competition-exam-import-detail']) {
  if (!new RegExp('name=["\\\']' + route + '["\\\']').test(layout)) {
    failures.push('Admin layout no registra ' + route + '.');
  }
}

if (!/competition-exam-imports\?examId=/.test(examDetail) || !/Importar Excel/.test(examDetail)) {
  failures.push('Detalle de examen no abre Importar Excel.');
}

if (!/pickAndParseUcapsaExamXlsx/.test(imports)
  || !/createCompetitionExamImportBatch/.test(imports)
  || !/validateCompetitionExamImportBatch/.test(imports)) {
  failures.push('Pantalla de importación perdió archivo → crear lote → validar.');
}

if (!/exam\.status === 'published'/.test(imports)
  || !/season\?\.status !== 'closed'/.test(imports)
  || !/items\.length > 0/.test(imports)) {
  failures.push('Nueva importación dejó de exigir examen publicado, temporada mutable y ejercicios.');
}

if (!/rowsInvalid === 0/.test(importDetail)
  || !/rowsValid === detail\.rowsTotal/.test(importDetail)) {
  failures.push('UI volvió a permitir confirmar una importación parcial.');
}

if (!/picked\.fileName[\s\S]*expected/.test(importDetail)) {
  failures.push('Revalidación dejó de proteger el nombre original del archivo.');
}

for (const token of [
  'validateCompetitionExamImportBatch',
  'commitCompetitionExamImportBatch',
  'reviewCompetitionExamImportBatch',
  'publishCompetitionExamImportBatch',
  'revertCompetitionExamImportBatch',
]) {
  if (!importDetail.includes(token)) failures.push('Detalle de lote perdió acción: ' + token);
}

if (!/publishedAttempts === detail\.attempts\.length/.test(importDetail)
  || !/reviewedAttempts \+ detail\.publishedAttempts/.test(importDetail)) {
  failures.push('Etapa del lote dejó de derivarse desde los intentos.');
}

if (/batch\.status === ['"]reviewed['"]|batch\.status === ['"]published['"]/.test(importDetail)) {
  failures.push('La UI inventó estados reviewed/published para el lote; esos estados viven en intentos.');
}

if (!/publishedAttempts === 0/.test(importDetail) || !/officialAttempts === 0/.test(importDetail)) {
  failures.push('Reversión UI dejó de bloquear lotes con intentos publicados/oficiales.');
}

for (const token of [
  ".from('ucapsa_import_batches')",
  ".from('ucapsa_exam_import_preview')",
  ".from('ucapsa_exam_attempts')",
  'admin_create_ucapsa_exam_import_batch',
  'admin_validate_ucapsa_exam_import_batch',
  'admin_commit_ucapsa_exam_import_batch',
  'admin_review_ucapsa_exam_import_batch',
  'admin_publish_ucapsa_exam_import_batch',
  'admin_revert_ucapsa_exam_import_batch',
]) {
  if (!service.includes(token)) failures.push('Servicio de importación perdió contrato canónico: ' + token);
}

if (/ucapsa_points_/.test(parser + imports + importDetail)) {
  failures.push('Importación de exámenes no puede depender de UCAPSA Points legado.');
}

if (!pkg.scripts?.verify?.includes('check:rango-1-admin-exam-import-ui')) {
  failures.push('npm verify no incluye el guard de importación Excel.');
}

if (failures.length) {
  console.error('RANGO 1 ADMIN EXAM IMPORT UI FAIL:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Rango 1 Admin exam import UI: PASS');
