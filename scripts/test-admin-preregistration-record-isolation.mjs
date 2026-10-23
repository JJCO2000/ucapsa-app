import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/admin/preregistration.tsx','utf8');
const parsed = ts.createSourceFile('preregistration.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  'Admin detail TSX should parse: '+parsed.parseDiagnostics.map(d=>d.messageText).join('; '));
let loadInitializer;
function scan(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load' && node.initializer) {
    loadInitializer = node.initializer;
  }
  ts.forEachChild(node,scan);
}
scan(parsed);
assert.ok(loadInitializer && ts.isCallExpression(loadInitializer),'Actual load callback must exist');
const arrow = loadInitializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow),'Extract the real production load callback');
const js = ts.transpileModule('exports.makeLoad = () => ('+arrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function makeHarness(recordId='A') {
  const ids={requestIdRef:{current:0},activeRecordIdRef:{current:recordId}};
  const adminCalls=[],familyCalls=[];
  const state={record:'initial',family:['previous'],loadedFor:'initial',loading:true,
    refreshing:true,error:null};
  const exports={};
  vm.runInNewContext(js,{
    exports,recordId,...ids,
    getAdminPreregistrationRecords:()=>{
      const call=deferred();adminCalls.push(call);return call.promise;
    },
    getAdminPreregisteredFamily:()=>{
      const call=deferred();familyCalls.push(call);return call.promise;
    },
    setError:v=>state.error=v,
    setLoadedRecord:v=>state.record=v,
    setFamily:v=>state.family=v,
    setLoadedForRecordId:v=>state.loadedFor=v,
    setLoading:v=>state.loading=v,
    setRefreshing:v=>state.refreshing=v,
  });
  return {load:exports.makeLoad(),ids,state,adminCalls,familyCalls};
}
const row=(id)=>({intakeProgramId:id,dogName:'Dog '+id});
function settle(h,i,records,members) {
  h.adminCalls[i].resolve(records);
  h.familyCalls[i].resolve(members);
}
async function run(){
  // A navigation blur must invalidate any response from A before showing B.
  {
    const a=makeHarness();
    const pending=a.load();
    a.ids.activeRecordIdRef.current='B';a.ids.requestIdRef.current++;
    settle(a,0,[row('A')],[{id:'secret-A'}]);await pending;
    assert.equal(a.state.record,'initial');
    assert.deepEqual(a.state.family,['previous']);
    assert.equal(a.state.loadedFor,'initial');
  }
  // Slow first refresh cannot overwrite newer refresh for the same record.
  {
    const a=makeHarness();
    const old=a.load();const latest=a.load();
    settle(a,1,[row('A')],[{id:'fresh'}]);await latest;
    settle(a,0,[row('A'),row('other')],[{id:'stale'}]);await old;
    assert.equal(a.state.record.dogName,'Dog A');
    assert.equal(a.state.family[0].id,'fresh');
    assert.equal(a.state.loadedFor,'A');
    assert.equal(a.state.loading,false);
  }
  // Never display the first returned record when its id differs from the requested one.
  {
    const a=makeHarness();
    const pending=a.load();
    settle(a,0,[row('another')],[{id:'wrong-family'}]);await pending;
    assert.equal(a.state.record,null);
    assert.equal(a.state.family.length,0);
  }
  // A current request failure must clear any previously loaded personal information.
  {
    const a=makeHarness();
    const pending=a.load();
    a.adminCalls[0].reject(new Error('falló la red'));
    a.familyCalls[0].resolve([]);await pending;
    assert.equal(a.state.record,null);
    assert.equal(a.state.family.length,0);
    assert.equal(a.state.error,'falló la red');
    assert.equal(a.state.loading,false);
  }
  // A stale event from an abandoned screen may not start another RPC.
  {
    const a=makeHarness();
    a.ids.activeRecordIdRef.current='B';
    await a.load();
    assert.equal(a.adminCalls.length,0);
    assert.equal(a.familyCalls.length,0);
  }
  for (const token of [
    'const record = loadedForRecordId === recordId ? loadedRecord : null',
    'const result = rows.find((row) => row.intakeProgramId === recordId)',
    "activeRecordIdRef.current = '';",
    'setNewFamily([])',
    'setEditingContact(false)',
    'setFeedback(null)',
    'record && !loading && !error',
    'if (activeRecordIdRef.current !== recordId) return;',
  ]) assert.ok(source.includes(token),'Private-record isolation invariant missing: '+token);
  assert.ok((source.match(/if \(activeRecordIdRef\.current !== recordId\) return;/g)||[]).length>=4,
    'All three actions must avoid reloading an old expediente');
  console.log('Admin preregistration detail: current record, late responses, refresh order, errors, route changes and write guards PASS');
}
await run();
