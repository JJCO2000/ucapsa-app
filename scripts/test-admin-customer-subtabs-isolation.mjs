import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const files=['src/app/admin/customer.tsx','src/app/admin/customer-section.tsx'];
function extract(source,identifier) {
  const tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  assert.equal(tree.parseDiagnostics.length,0,tree.parseDiagnostics.map(d=>String(d.messageText)).join(';'));
  let callback;
  function visit(node){
    if(ts.isVariableDeclaration(node) && node.name.getText(tree)===identifier){
      assert.ok(node.initializer && ts.isCallExpression(node.initializer),identifier+' callback missing');
      callback=node.initializer.arguments[0];
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  assert.ok(callback && ts.isArrowFunction(callback),identifier+' must be a real arrow callback');
  return ts.transpileModule('exports.make = () => ('+callback.getText(tree)+');',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
  return {promise,resolve,reject};
}
function harness(file,userId='A'){
  const source=fs.readFileSync(file,'utf8');
  const queue=[],state={record:null,loadedFor:null,error:'',loading:true,refreshing:true};
  const activeUserIdRef={current:userId},loadRunRef={current:0},exports={};
  vm.runInNewContext(extract(source,'load'),{
    exports,Error,userId,activeUserIdRef,loadRunRef,
    getAdminCustomerRecord:()=>{
      const call=deferred();queue.push(call);return call.promise;
    },
    setStoredRecord:value=>state.record=value,
    setLoadedForUserId:value=>state.loadedFor=value,
    setError:value=>state.error=value,
    setLoading:value=>state.loading=value,
    setRefreshing:value=>state.refreshing=value,
  });
  return {load:exports.make(),queue,state,activeUserIdRef,loadRunRef,source};
}
const client=(id,extra={})=>({profile:{user_id:id,full_name:'Cliente '+id},enrollments:[],obligations:[],payments:[],...extra});
async function checkLoads(file){
  {
    const h=harness(file);
    const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.queue[0].resolve(client('A'));
    await pending;
    assert.equal(h.state.record,null,'Old client must never reappear after switching');
    assert.equal(h.state.loadedFor,null);
  }
  {
    const h=harness(file);
    const old=h.load();const newer=h.load();
    h.queue[1].resolve(client('A',{source:'new'}));await newer;
    h.queue[0].resolve(client('A',{source:'stale'}));await old;
    assert.equal(h.state.record.source,'new','Out-of-order request must be ignored');
    assert.equal(h.state.loadedFor,'A');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness(file);
    const pending=h.load();
    h.queue[0].resolve(client('another'));
    await pending;
    assert.equal(h.state.record,null);
    assert.match(h.state.error,/no corresponde/);
  }
  {
    const h=harness(file);
    const pending=h.load();
    h.queue[0].reject(new Error('Sin conexión'));
    await pending;
    assert.equal(h.state.record,null);
    assert.equal(h.state.error,'Sin conexión');
    assert.equal(h.state.loading,false);
  }
  for(const token of [
    'const record = loadedForUserId === userId ? storedRecord : null',
    'activeUserIdRef.current === userId',
    'if (!isCurrentRun()) return',
    'next.profile.user_id !== userId',
    'return () => { loadRunRef.current += 1; }',
    'setLoadedForUserId(null)',
    'setStoredRecord(null)',
    'setRefreshing(false)',
  ])assert.ok(harness(file).source.includes(token),file+' lost guard: '+token);
}
function calculate(file,identifier,record) {
  const source=fs.readFileSync(file,'utf8'),exports={};
  vm.runInNewContext(extract(source,identifier),{exports,record,Map,Number,Math});
  return exports.make()();
}
const finance=client('A',{
  payments:[
    {id:'p1',obligation_id:'o1',status:'paid',voided_at:null,amount:40},
    {id:'p2',obligation_id:'o1',status:'paid',voided_at:'2026-10-20',amount:50},
    {id:'p3',obligation_id:'o1',status:'paid',voided_at:null,amount:10},
    {id:'p4',obligation_id:'o2',status:'pending',voided_at:null,amount:10},
  ],
  obligations:[
    {id:'o1',concept:'Primera',due_date:'2026-11-01',amount:100,cancelled_at:null},
    {id:'o2',concept:'Segunda',due_date:'2026-11-05',amount:50,cancelled_at:null},
    {id:'o3',concept:'Cancelada',due_date:'2026-11-10',amount:70,cancelled_at:'2026-10-01'},
  ],
});
for(const f of files) await checkLoads(f);
const mainBalance=calculate(files[0],'pendingBalance',finance);
const section=calculate(files[1],'paymentSummary',finance);
assert.equal(mainBalance,100,'Only real paid non-voided amounts reduce pending balance');
assert.equal(section.balance,mainBalance,'Financial SSOT: summary and subtab must agree');
assert.equal(section.open.length,2);
const sectionCode=fs.readFileSync(files[1],'utf8');
assert.ok(sectionCode.includes("payment.status !== 'paid' || payment.voided_at"),
  'Void payments must never reduce obligation balances');
assert.ok(sectionCode.includes("payment.voided_at ? 'ANULADO"),
  'Voided payments still in history must be clearly labeled');
for(const section of ['profile','membership','classes','attendance','payments']){
  assert.ok(sectionCode.includes("record && !loading && !error && section === '"+section+"'"),
    'Sensitive '+section+' subtab cannot show stale/failed data');
}
console.log('UCAPSA admin client: 2 screens, 5 subtabs, stale/failed/off-focus requests, profile identity and voided-payment balance PASS');
