import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path='src/app/client/practice-history.tsx';
const source=fs.readFileSync(path,'utf8');
const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let loadExpression;
function visit(node) {
  if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load')loadExpression=node.initializer;
  ts.forEachChild(node,visit);
}
visit(parsed);
assert.ok(loadExpression && ts.isCallExpression(loadExpression),'Real load callback should be present');
const arrow=loadExpression.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow),'Expected actual async loader');
const js=ts.transpileModule('exports.makeLoad=()=>('+arrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(){
  const state={activity:null,loadedFor:null,loading:true,error:null,offline:false};
  const cache=[],remote=[],warnings=[];
  const loadRunRef={current:0},activeUserIdRef={current:'A'},exports={};
  vm.runInNewContext(js,{
    exports,Error,user:{id:'A'},isAdmin:false,loadRunRef,activeUserIdRef,
    setError:v=>state.error=v,
    setUsingSavedData:v=>state.offline=v,
    setActivity:v=>state.activity=v,
    setLoadedForUserId:v=>state.loadedFor=v,
    setLoading:v=>state.loading=v,
    getCachedMyPracticeActivity:()=>{const x=deferred();cache.push(x);return x.promise;},
    getMyPracticeActivity:()=>{const x=deferred();remote.push(x);return x.promise;},
    devWarn:(...x)=>warnings.push(x),
  });
  return {load:exports.makeLoad(),state,loadRunRef,activeUserIdRef,cache,remote,warnings};
}
const activity=(name,source='remote')=>({entries:[{id:name}],source,savedAt:'2026-10-24'});
async function ticks(){for(let i=0;i<5;i++)await Promise.resolve();}

{
  const h=harness(),pending=h.load();
  h.activeUserIdRef.current='B';h.loadRunRef.current++;
  h.cache[0].resolve(activity('private-A','cache'));await pending;
  assert.equal(h.state.activity,null,'Account B must not receive account A cache');
  assert.equal(h.state.loadedFor,null);
  assert.equal(h.remote.length,0,'Do not fetch after stale session');
}
{
  const h=harness(),older=h.load(),newer=h.load();
  h.cache[1].resolve(null);await ticks();
  h.remote[0].resolve(activity('newer'));await newer;
  h.cache[0].resolve(activity('older','cache'));await older;
  assert.equal(h.state.activity.entries[0].id,'newer');
  assert.equal(h.state.loadedFor,'A');
  assert.equal(h.state.loading,false);
}
{
  const h=harness(),pending=h.load();
  h.cache[0].resolve(activity('saved','cache'));await ticks();
  h.remote[0].reject(new Error('offline'));await pending;
  assert.equal(h.state.activity.entries[0].id,'saved');
  assert.equal(h.state.offline,true);
  assert.equal(h.state.error,null);
}
{
  const h=harness(),pending=h.load();
  h.cache[0].resolve(null);await ticks();
  h.remote[0].reject(new Error('offline'));await pending;
  assert.equal(h.state.error,'No pudimos cargar tu historial de prácticas.');
  assert.equal(h.state.activity,null);
  assert.equal(h.state.loadedFor,null);
}
{
  const h=harness(),pending=h.load();
  h.cache[0].reject(new Error('cache corrupta'));await ticks();
  assert.equal(h.remote.length,1,'Broken cache should not stop official read');
  h.remote[0].resolve(activity('remote'));await pending;
  assert.equal(h.state.activity.entries[0].id,'remote');
  assert.equal(h.warnings.length,1);
}
{
  const h=harness(),pending=h.load();
  h.cache[0].resolve(null);await ticks();
  h.activeUserIdRef.current='B';h.loadRunRef.current++;
  h.remote[0].resolve(activity('private-A'));await pending;
  assert.equal(h.state.activity,null,'Stale remote response must not overwrite new account');
}
for(const invariant of [
  'const activity = loadedForUserId === user?.id ? storedActivity : null',
  'activeUserIdRef.current === userId',
  'setLoadedForUserId(null)',
  'setActivity(null)',
  'return () => { loadRunRef.current += 1; }',
  'activity && !loading && !error',
  'if (!isCurrentRun()) return;',
]){
  assert.ok(source.includes(invariant),'Practice session guard missing: '+invariant);
}
console.log('UCAPSA practice history: session isolation, concurrent loads, stale responses, offline fallback and errors PASS');
