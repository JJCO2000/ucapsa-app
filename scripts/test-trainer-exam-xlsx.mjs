import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { unzipSync, strFromU8 } from 'fflate';

const raw = fs.readFileSync('src/services/exam-report-export.service.ts', 'utf8');
const js = ts.transpileModule(raw, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
const fflate = await import('fflate');
function mockRequire(name) {
  if (name === 'fflate') return fflate;
  if (name === 'expo-file-system') return { File: class File {}, Paths: {} };
  if (name === 'expo-sharing') return {};
  if (name === '../lib/supabase') return { supabase: {} };
  throw new Error('Dependencia inesperada: ' + name);
}
vm.runInNewContext(js, { module, exports: module.exports, require: mockRequire, Buffer, console });
assert.equal(typeof module.exports.buildStaffExamWorkbookBytes, 'function');

function score(dogId, dogName, attemptId, itemId, itemNumber, max, points, date='2026-10-18') {
  return {
    attemptId, examId:'exam01', examCode:'EX1', examTitle:'Comandos', presentedDate:date,
    attemptNumber: attemptId.endsWith('OLD') ? 1 : 2,
    status:'published', isOfficial:true, voidedAt:null, dogId, dogName,
    clientName:'Tutor '+dogId, itemId, itemNumber,
    itemTitle:itemId === 'one' ? 'Sentado' : 'Quieto',
    maxPoints:max, pointsAwarded:points, evaluatorNote:null,
  };
}
const rows=[
  score('dogA','Luna','a-new','one',1,10,9),
  score('dogA','Luna','a-new','two',2,20,20),
  score('dogA','Luna','a-OLD','one',1,10,1,'2026-09-12'),
  score('dogA','Luna','a-OLD','two',2,20,1,'2026-09-12'),
  score('dogB','Luna','b-new','one',1,10,0),
  score('dogB','Luna','b-new','two',2,20,20),
  score('dogC','Rocky','c-new','one',1,10,5),
  score('dogC','Rocky','c-new','two',2,20,null),
  {...score('dogD','Toby','d-new','one',1,10,10),isOfficial:false,status:'reviewed'},
];
const workbook=module.exports.buildStaffExamWorkbookBytes(rows,['dogA','dogB','dogC','dogD']);
const zip=unzipSync(workbook);
const xml=(name)=>{
  assert.ok(zip[name], 'Falta archivo XLSX: '+name);
  return strFromU8(zip[name]);
};
const book=xml('xl/workbook.xml');
assert.ok(book.includes('Comparación') && !book.includes('Estadísticas') && !book.includes('Resultados'));
const sheet=xml('xl/worksheets/sheet1.xml');
assert.ok(sheet.includes('Sentado') && sheet.includes('Quieto') && sheet.includes('Promedio'));
assert.ok(sheet.includes('Luna') && sheet.includes('Rocky'));
assert.ok(sheet.includes('Tutor dogA') && sheet.includes('Tutor dogB'),
  'Perros homónimos deben distinguirse por tutor/UUID');
assert.ok(sheet.includes('<v>0</v>'), '0 real conserva su valor');
assert.ok(sheet.includes('Sin registrar'), 'Los faltantes nunca son cero');
assert.ok(sheet.includes('Incompleto'), 'Promedio incompleto queda explícito');
assert.ok(sheet.includes('<f>IF(COUNT('), 'El promedio debe recalcularse en Excel');
assert.ok(sheet.includes('<v>0.9666666666666667</v>'),
  'Calificación final utiliza 29/30, sin mezclar reintentos');
assert.ok(sheet.includes('<v>0.6666666666666666</v>'),
  'Calificación final utiliza 20/30 con cero real');
assert.ok(!sheet.includes('Toby'), 'No se muestran resultados provisionales como oficiales');
assert.ok(zip['xl/styles.xml'] && xml('xl/styles.xml').includes('numFmtId="10"'));
assert.ok(zip['[Content_Types].xml'] && zip['_rels/.rels']);
assert.ok(xml('xl/_rels/workbook.xml.rels').includes('worksheets/sheet1.xml'));
const onlyA=xmlOf(module.exports.buildStaffExamWorkbookBytes(rows,['dogA']));
function xmlOf(bytes) { return strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']); }
assert.ok(onlyA.includes('Luna') && !onlyA.includes('Rocky'), 'El filtro por perro usa UUID');
assert.throws(()=>module.exports.buildStaffExamWorkbookBytes(rows,['dogD']), /No hay resultados oficiales/);
console.log('UCAPSA matriz cruzada, promedio dinámico, reintentos, perros homónimos y selección: PASS');
