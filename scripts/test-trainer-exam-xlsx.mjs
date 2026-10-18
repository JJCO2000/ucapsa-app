import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { unzipSync, strFromU8 } from 'fflate';

// Prueba REAL del .xlsx en memoria. No requiere Expo, Auth ni BD.
const raw = fs.readFileSync('src/services/exam-report-export.service.ts', 'utf8');
const js = ts.transpileModule(raw, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
function mockRequire(name) {
  if (name === 'fflate') return awaitableFFlate;
  if (name === 'expo-file-system') return { File: class File {}, Paths: {} };
  if (name === 'expo-sharing') return {};
  if (name === '../lib/supabase') return { supabase: {} };
  throw new Error('Dependencia inesperada: ' + name);
}
const awaitableFFlate = await import('fflate');
vm.runInNewContext(js, { module, exports: module.exports, require: mockRequire, Buffer, console }, {
  filename: 'exam-report-export.service.js',
});
assert.equal(typeof module.exports.buildStaffExamWorkbookBytes, 'function');

function row(attempt, item, score, official, status, max=10) {
  return {
    attemptId: attempt, examId: 'exam01', examCode: 'EXAM01', examTitle: 'Evaluación base',
    presentedDate: '2026-10-18', attemptNumber: 1,
    status, isOfficial: official, voidedAt: null, dogId: 'dog'+attempt,
    dogName: 'Perro '+attempt, clientName: 'Cliente '+attempt,
    itemId: item, itemNumber: 1, itemTitle: 'Sentado', maxPoints: max,
    pointsAwarded: score, evaluatorNote: null,
  };
}
const sample = [
  row('a', '1', 5, true, 'published'),
  row('a', '2', 5, true, 'published'),
  row('b', '1', 0, false, 'reviewed'),
  row('c', '1', null, true, 'published'),
];
const bytes = module.exports.buildStaffExamWorkbookBytes(sample, '2026-10-01', '2026-10-18');
assert.ok(bytes.length > 1000, 'Archivo inválido o vacío');
const files = unzipSync(bytes);
const xml = (name) => {
  assert.ok(files[name], 'Falta parte XLSX: '+name);
  return strFromU8(files[name]);
};
const workbook = xml('xl/workbook.xml');
for (const sheet of ['Estadísticas','Resultados','Ejercicios']) {
  assert.ok(workbook.includes(sheet), 'Falta hoja: '+sheet);
}
const summary = xml('xl/worksheets/sheet1.xml');
const results = xml('xl/worksheets/sheet2.xml');
const detail = xml('xl/worksheets/sheet3.xml');
assert.ok(summary.includes('Intentos de evaluación') && summary.includes('Resultados oficiales'));
assert.ok(summary.includes('50.0%'), 'Promedio calculado solo sobre oficial completo');
assert.ok(results.includes('Sin datos'), 'Una evaluación incompleta NO debe obtener cero');
assert.ok(detail.includes('Sin registrar'), 'Ejercicio faltante debe conservar su ausencia de nota');
assert.ok(detail.includes('<v>0</v>'), 'Cero real debe conservarse como cero y no Sin registrar');
assert.ok(files['xl/styles.xml'] && files['[Content_Types].xml'] && files['_rels/.rels']);
assert.ok(xml('xl/_rels/workbook.xml.rels').includes('worksheets/sheet3.xml'));
console.log('UCAPSA XLSX real, tres hojas, faltantes/null, cero real y promedio oficial: PASS');
