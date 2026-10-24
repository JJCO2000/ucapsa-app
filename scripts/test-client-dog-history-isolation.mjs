import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file='src/app/client/dog-history.tsx';
const source=fs.readFileSync(file,'utf8');
const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let initializer;
function scan(node){
  if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') initializer=node.initializer;
  ts.forEachChild(node,scan);
}
scan(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Extract real useCallback load');
const callback=initializer.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback),'Expect async load arrow');
const js=ts.transpileModule('exports.makeLoad=()=>('+callback.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(){
  const state={storedRows:[],loadedFor:null,loading:true,error:null,usingSaved:false,savedAt:null};
  const cache=[],remote=[],writes=[],warnings=[];
  const loadRunRef={current:0},activeUserIdRef={current:'A'};
  const exports={};
  vm.runInNewContext(js,{
    exports,Error,user:{id:'A'},isAdmin:false,loadRunRef,activeUserIdRef,
    setRows:v=>state.storedRows=v,
    setLoadedForUserId:v=>state.loadedFor=v,
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    setUsingSavedData:v=>state.usingSaved=v,
    setSavedAt:v=>state.savedAt=v,
    readClientResource:()=>{const d=deferred();cache.push(d);return d.promise;},
    getMyProgramEnrollments:()=>{const d=deferred();remote.push(d);return d.promise;},
    writeClientResource:async (id,key,rows)=>{
      writes.push({id,key,rows});return {saved_at:'fresh'};
    },
    sanitizeProgramRowsForCache:x=>x,
    withOperationTimeout:p=>p,
    friendlyReadError:x=>x,
    DEFAULT_READ_TIMEOUT_MS:3000,
    clientReadKeys:{programs:'programs'},
    devWarn:(...x)=>warnings.push(x),
  });
  return {load:exports.makeLoad(),state,cache,remote,writes,warnings,loadRunRef,activeUserIdRef};
}
async function tick(){for(let i=0;i<5;i++)await Promise.resolve();}
const item=id=>[{enrollment:{id,dog_id:'D',created_at:'2026-10-01'},program:{code:'puppy'},attendances:[]}];

{
  const h=harness(),pending=h.load();
  h.activeUserIdRef.current='B';h.loadRunRef.current+=1;
  h.cache[0].resolve({data:item('private-A'),saved_at:'past'});await pending;
  assert.equal(h.remote.length,0,'Discard stale cache before contacting backend');
  assert.equal(h.state.loadedFor,null,'Never bind previous account cache');
}
{
  const h=harness(),older=h.load(),newer=h.load();
  h.cache[1].resolve(null);await tick();
  assert.equal(h.remote.length,1);
  h.remote[0].resolve(item('latest'));await newer;
  h.cache[0].resolve({data:item('stale'),saved_at:'old'});await older;
  assert.equal(h.state.storedRows[0].enrollment.id,'latest');
  assert.equal(h.state.loadedFor,'A');
  assert.equal(h.writes.length,1);
}
{
  const h=harness(),pending=h.load();
  h.cache[0].resolve({data:item('offline'),saved_at:'old'});await tick();
  assert.equal(h.state.storedRows[0].enrollment.id,'offline');
  h.remote[0].reject(new Error('offline'));await pending;
  assert.equal(h.state.usingSaved,true,'Cache remains available for same account');
  assert.equal(h.state.error,null);
  assert.equal(h.state.savedAt,'old');
}
{
  const h=harness(),pending=h.load();
  h.cache[0].resolve(null);await tick();
  h.remote[0].reject(new Error('offline'));await pending;
  assert.equal(h.state.error,'No se pudo cargar el historial de tu perro.');
  assert.equal(h.state.loading,false);
  assert.equal(h.state.loadedFor,null);
}
{
  const h=harness(),pending=h.load();
  h.cache[0].reject(new Error('cache failure'));await tick();
  assert.equal(h.remote.length,1,'Cache failure must not prevent remote reading');
  h.remote[0].resolve(item('from-server'));await pending;
  assert.equal(h.state.storedRows[0].enrollment.id,'from-server');
  assert.equal(h.warnings.length,1);
}
{
  const h=harness(),pending=h.load();
  h.cache[0].resolve(null);await tick();
  h.activeUserIdRef.current='B';h.loadRunRef.current++;
  h.remote[0].resolve(item('late-private-A'));await pending;
  assert.equal(h.writes.length,0,'Do not cache stale session results');
  assert.equal(h.state.loadedFor,null);
}
for(const token of [
  'const rows = loadedForUserId === user?.id ? storedRows : []',
  'activeUserIdRef.current === userId',
  'if (!isCurrentRun()) return;',
  'setLoadedForUserId(userId)',
  'setLoadedForUserId(null)',
  'setRows([])',
  'return () => { loadRunRef.current += 1; }',
  '!loading && !error ? <View style={styles.list}>',
  'if (cached) setUsingSavedData(true)',
  'else setError(friendlyReadError',
]) assert.ok(source.includes(token),'Missing session isolation contract: '+token);
console.log('UCAPSA dog history: session, stale cache/network, concurrent refresh, offline fallback and error protection PASS');
