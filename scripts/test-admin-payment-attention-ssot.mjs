import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file='src/app/(tabs)/admin-payments.tsx';
const source=fs.readFileSync(file,'utf8');
const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Admin Payments TSX must parse');
let initializer;
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') initializer=node.initializer;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Real admin payments load callback missing');
const fn=initializer.arguments[0];
assert.ok(fn && ts.isArrowFunction(fn),'Actual load callback required');
const compiled=ts.transpileModule('exports.loadFactory=()=>('+fn.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function harness({isAdmin=true,attention=[],profiles=[]}={}) {
  const state={error:'stale',rows:[],hasData:false};
  const calls={attention:0,profiles:0};
  const exports={};
  vm.runInNewContext(compiled,{
    exports,Promise,Map,Number,isAdmin,
    getAdminPaymentAttentionRows:async()=>{calls.attention++;return attention;},
    getAdminClientProfiles:async()=>{calls.profiles++;return profiles;},
    withOperationTimeout:async p=>p,
    DEFAULT_READ_TIMEOUT_MS:3000,
    setError:v=>state.error=v,
    setRows:v=>state.rows=JSON.parse(JSON.stringify(v)),
    setHasData:v=>state.hasData=v,
  });
  return {load:exports.loadFactory(),state,calls};
}
{
  const h=harness({attention:[],profiles:[{user_id:'member1',role:'member'},
    {user_id:'member2',role:'member'}]});
  await h.load();
  assert.equal(h.state.rows.length,0,'No debts: no fabricated pending payments');
  assert.equal(h.state.hasData,true);
  assert.equal(h.state.error,null);
  assert.deepEqual(h.calls,{attention:1,profiles:1});
}
{
  const h=harness({
    attention:[
      {userId:'A',balance:30,overdue:false,partial:false,obligations:1},
      {userId:'B',balance:70,overdue:true,partial:true,obligations:2},
    ],
    profiles:[{user_id:'A',full_name:'Ana'}, {user_id:'B',full_name:'Beto'}],
  });
  await h.load();
  assert.equal(h.state.rows.length,2);
  assert.equal(h.state.rows[0].userId,'B');
  assert.equal(h.state.rows[0].balance,70);
  assert.equal(h.state.rows[0].obligations,2);
  assert.equal(h.state.rows[0].profile.full_name,'Beto');
  assert.equal(h.state.rows[1].userId,'A');
}
{
  const h=harness({isAdmin:false,attention:[{userId:'A',balance:100}]});
  await h.load();
  assert.equal(h.calls.attention,0);
  assert.equal(h.calls.profiles,0);
  assert.equal(h.state.rows.length,0);
}
for (const token of [
  'getAdminPaymentAttentionRows()',
  'getAdminClientProfiles()',
  'balance: row.balance',
  'obligations: row.obligations',
  'obligación',
  '{hasData && !loading && !error',
  '!loading && !error && filtered.map',
]) assert.ok(source.includes(token),'Missing canonical payment-attention contract: '+token);
for (const forbidden of [
  'getAdminMembershipRows',
  'current_payment_status',
  'legacyPending',
  'Pago pendiente por revisar',
  'balance: null',
]) assert.ok(!source.includes(forbidden),'Unjustified debt inference returned: '+forbidden);
const home=fs.readFileSync('src/app/(tabs)/admin-home.tsx','utf8');
assert.ok(home.includes('paymentAttention: paymentAttentionRows.length'),
  'Admin Home must use same canonical unpaid-obligation service');
console.log('UCAPSA Admin Pagos: no fabricated debts, real balances, role guard and Home SSOT PASS');
