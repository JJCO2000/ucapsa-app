import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path='src/app/admin/customer-section.tsx';
const source=fs.readFileSync(path,'utf8');
const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
let initializer;
function find(node){
  if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==='paymentSummary') initializer=node.initializer;
  ts.forEachChild(node,find);
}
find(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Extract real payment summary hook');
const callback=initializer.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback),'Payment summary must remain a pure calculation');
const code=ts.transpileModule('exports.calculate = () => ('+callback.getText(parsed)+')();',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function calculate(record) {
  const exports={};
  vm.runInNewContext(code,{exports,record,Map,Number,Math});
  return exports.calculate();
}
const record={
  obligations:[
    {id:'active',amount:100,due_date:'2026-10-31',concept:'Cuota',cancelled_at:null},
    {id:'cancelled',amount:200,due_date:'2026-11-03',concept:'Anulada',cancelled_at:'2026-10-22'},
    {id:'paid',amount:50,due_date:'2026-11-10',concept:'Cubierta',cancelled_at:null},
  ],
  payments:[
    {obligation_id:'active',status:'paid',amount:40,voided_at:null},
    {obligation_id:'active',status:'paid',amount:60,voided_at:'2026-10-23',void_reason:'Corrección'},
    {obligation_id:'active',status:'pending',amount:5,voided_at:null},
    {obligation_id:'cancelled',status:'paid',amount:200,voided_at:null},
    {obligation_id:'paid',status:'paid',amount:50,voided_at:null},
  ],
};
const current=calculate(record);
assert.equal(current.balance,60,
  'A voided payment must not reduce the effective outstanding balance');
assert.equal(current.open.length,1);
assert.equal(current.open[0].id,'active');
assert.equal(current.open[0].balance,60);
assert.equal(calculate({...record,payments:record.payments.filter(p=>p.voided_at)}).balance,150,
  'Only cancelled obligations are excluded; voided payments carry no credit');
assert.equal(calculate(null).balance,0);
for(const contract of [
  "payment.status !== 'paid' || payment.voided_at",
  "item.cancelled_at",
  "payment.voided_at ? ' · Anulado' : ''",
  "payment.voided_at && styles.voidedAmount",
  "textDecorationLine: 'line-through'",
]) assert.ok(source.includes(contract),'Customer payments subtab lost historical-payment contract: '+contract);
const full=fs.readFileSync('src/app/admin/customer-payments.tsx','utf8');
const top=fs.readFileSync('src/app/admin/customer.tsx','utf8');
for(const [name,content] of [['customer detail',top],['payment operations',full]]) {
  assert.ok(content.includes("payment.status !== 'paid' || payment.voided_at"),
    name+' must agree on effective payments');
}
console.log('ADMIN CUSTOMER SUBTAB PAYMENTS: real summary excludes voided/pending, cancelled obligations, and labels historical rows PASS');
