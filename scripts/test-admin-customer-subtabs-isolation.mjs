import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const hook = fs.readFileSync('src/hooks/useAdminCustomerDetail.ts','utf8');
const section = fs.readFileSync('src/app/admin/customer-section.tsx','utf8');
const customer = fs.readFileSync('src/app/admin/customer.tsx','utf8');

function findCallback(source, name, path) {
  const parsed = ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length,0,path+' has TS parse errors');
  let fn;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed)===name) {
      assert.ok(ts.isCallExpression(node.initializer),name+' is not a hook call');
      fn = node.initializer.arguments[0];
    }
    ts.forEachChild(node,walk);
  }
  walk(parsed);
  assert.ok(fn && ts.isArrowFunction(fn),'Cannot find real callback: '+name);
  return fn.getText(parsed);
}
function compileArrow(source,name,path) {
  const arrow=findCallback(source,name,path);
  return ts.transpileModule('exports.fn = ('+arrow+');',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
}
const loader = compileArrow(hook,'load','src/hooks/useAdminCustomerDetail.ts');
const summary = compileArrow(section,'paymentSummary','src/app/admin/customer-section.tsx');
function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(userId='A') {
  const calls=[];
  const state={record:null,resolved:null,loading:true,error:''};
  const loadRunRef={current:0};
  const activeUserIdRef={current:userId};
  const exports={};
  vm.runInNewContext(loader,{
    exports,Error,userId,loadRunRef,activeUserIdRef,
    getAdminCustomerRecord:()=>{const d=deferred();calls.push(d);return d.promise;},
    setStoredRecord:v=>state.record=v,
    setResolvedForUserId:v=>state.resolved=v,
    setError:v=>state.error=v,
    setLoading:v=>state.loading=v,
  });
  return {load:exports.fn, state,calls,activeUserIdRef,loadRunRef};
}
const record=userId=>({profile:{user_id:userId,full_name:userId},enrollments:[],
  payments:[],obligations:[],dogs:[],memberVisits:[],membership:null});
async function tests() {
  {
    const h=harness();
    const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.calls[0].resolve(record('A'));
    await pending;
    assert.equal(h.state.record,null,'Old customer must never show under new route');
    assert.equal(h.state.resolved,null);
  }
  {
    const h=harness();
    const stale=h.load();
    const fresh=h.load();
    h.calls[1].resolve(record('A'));await fresh;
    h.calls[0].resolve({...record('A'),profile:{user_id:'A',full_name:'stale'}});await stale;
    assert.equal(h.state.record.profile.full_name,'A');
    assert.equal(h.state.resolved,'A');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();
    const pending=h.load();h.calls[0].resolve(record('B'));await pending;
    assert.equal(h.state.record,null,'Mismatched user ID must be rejected');
    assert.equal(h.state.error,'El servidor devolvió la ficha de otro cliente.');
    assert.equal(h.state.resolved,'A');
  }
  {
    const h=harness();
    const pending=h.load();h.calls[0].reject(new Error('sin red'));await pending;
    assert.equal(h.state.record,null);
    assert.equal(h.state.error,'sin red');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();
    const pending=h.load();h.activeUserIdRef.current='';
    h.loadRunRef.current++;h.calls[0].reject(new Error('obsolete'));await pending;
    assert.equal(h.state.error,'');
    assert.equal(h.state.resolved,null);
  }

  // Real payment-balance expression from the Administration payments subsection.
  const exports={};
  const scope={
    exports,Map,Math,Number,
    record:{
      payments:[
        {obligation_id:'o1',status:'paid',amount:400,voided_at:null},
        {obligation_id:'o1',status:'paid',amount:150,voided_at:'2026-10-01'},
        {obligation_id:'o2',status:'paid',amount:80,voided_at:null},
        {obligation_id:'o2',status:'pending',amount:20,voided_at:null},
      ],
      obligations:[
        {id:'o1',amount:1000,cancelled_at:null,concept:'Clase',due_date:'2026-11-01'},
        {id:'o2',amount:100,cancelled_at:null,concept:'Cuota',due_date:'2026-11-02'},
        {id:'o3',amount:300,cancelled_at:'2026-10-02',concept:'Anulado',due_date:'2026-11-03'},
      ],
    },
  };
  // The actual source uses useMemo(() => ...), so extract/evaluate its callback.
  vm.runInNewContext(summary,scope);
  const payment=scope.exports.fn();
  assert.equal(payment.balance,620,'Only nonvoided paid amounts reduce active obligations');
  assert.equal(payment.open.length,2);
  assert.equal(payment.open[0].balance,600);
  assert.equal(payment.open[1].balance,20);

  assert.ok(section.includes("payment.voided_at ? 'ANULADO"), 'Voided payment history must be visibly labeled');

  for(const [name,text] of [['customer',customer],['customer-section',section]]) {
    assert.ok(text.includes("useAdminCustomerDetail(userId)"),
      name+': must reuse common customer loader');
    assert.ok(text.includes('!loading && !error'),
      name+': do not render interactive private details in pending/error state');
    assert.ok(!text.includes('getAdminCustomerRecord(userId)'),
      name+': legacy duplicate unguarded request found');
  }
  for(const token of [
    'resolvedForUserId === userId ? storedRecord : null',
    'activeUserIdRef.current === userId',
    'loadRunRef.current === runId',
    "result.profile.user_id !== userId",
    'return () => { loadRunRef.current += 1;',
    'setStoredRecord(null)',
    'setResolvedForUserId(null)',
  ]) assert.ok(hook.includes(token),'Missing customer detail isolation: '+token);
  for(const key of ['profile','membership','classes','attendance','payments']){
    assert.ok(section.includes("section === '"+key+"'"),'Missing Administration subsection: '+key);
  }
}
await tests();
console.log('UCAPSA admin customer sections PASS: real async loading isolation, stale/error guards, five subsections, and nonvoided financial balances.');
