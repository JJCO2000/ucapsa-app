import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path='src/app/client/class-detail.tsx';
const source=fs.readFileSync(path,'utf8');
const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Class detail TSX must parse');
let initializer;
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') initializer=node.initializer;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Real class load callback missing');
const arrow=initializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow),'Real class load must be a callback arrow');
const js=ts.transpileModule('exports.makeLoad=()=>('+arrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness({userId='A',enrollmentId='class-A',writeFail=false}={}) {
  const detailKey=userId && enrollmentId ? userId+':'+enrollmentId : '';
  const activeDetailKeyRef={current:detailKey},loadRunRef={current:0};
  const state={item:'old',loadedForKey:null,nextSession:null,warning:false,
    loading:true,error:null,savedAt:null,offline:false};
  const caches=[],remotes=[],sessions=[],writes=[],warnings=[];
  const exports={};
  vm.runInNewContext(js,{
    exports,Error,userId,enrollmentId,isAdmin:false,detailKey,activeDetailKeyRef,loadRunRef,
    setItem:v=>state.item=v,
    setLoadedForKey:v=>state.loadedForKey=v,
    setNextSession:v=>state.nextSession=v,
    setSessionWarning:v=>state.warning=v,
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    setSavedAt:v=>state.savedAt=v,
    setUsingSavedData:v=>state.offline=v,
    readClientResource:()=>{const d=deferred();caches.push(d);return d.promise;},
    getMyProgramEnrollments:()=>{const d=deferred();remotes.push(d);return d.promise;},
    getCanonicalNextProgramSessions:()=>{const d=deferred();sessions.push(d);return d.promise;},
    writeClientResource:async(userId,key,rows)=>{
      writes.push({userId,key,rows});
      if(writeFail)throw new Error('cache-write');
      return {saved_at:'recent'};
    },
    sanitizeProgramRowsForCache:items=>items,
    withOperationTimeout:p=>p,
    friendlyReadError:s=>s,
    clientReadKeys:{programs:'programs'},
    DEFAULT_READ_TIMEOUT_MS:3000,
    devWarn:(...args)=>warnings.push(args),
  });
  return {load:exports.makeLoad(),state,detailKey,activeDetailKeyRef,loadRunRef,
    caches,remotes,sessions,writes,warnings};
}
const entry=(id,status='completed')=>({
  enrollment:{id,status},program:{code:'puppy'},attendances:[],
});
async function tick(){for(let i=0;i<5;i++)await Promise.resolve();}
{
  const h=harness(),pending=h.load();
  h.activeDetailKeyRef.current='B:class-B';h.loadRunRef.current++;
  h.caches[0].resolve({data:[entry('class-A')],saved_at:'old'});await pending;
  assert.equal(h.remotes.length,0);
  assert.equal(h.state.loadedForKey,null,'Old account class must not become visible');
}
{
  const h=harness();const old=h.load(),recent=h.load();
  h.caches[1].resolve(null);await tick();
  assert.equal(h.remotes.length,1);
  h.remotes[0].resolve([entry('class-A')]);await recent;
  h.caches[0].resolve({data:[entry('stale')],saved_at:'old'});await old;
  assert.equal(h.state.item.enrollment.id,'class-A');
  assert.equal(h.state.loadedForKey,h.detailKey);
  assert.equal(h.writes.length,1);
}
{
  const h=harness(),pending=h.load();
  h.caches[0].resolve({data:[entry('class-A')],saved_at:'old'});await tick();
  h.remotes[0].reject(new Error('offline'));await pending;
  assert.equal(h.state.item.enrollment.id,'class-A');
  assert.equal(h.state.offline,true);
  assert.equal(h.state.error,null);
}
{
  const h=harness(),pending=h.load();
  h.caches[0].reject(new Error('cache-corrupt'));await tick();
  h.remotes[0].resolve([entry('class-A')]);await pending;
  assert.equal(h.state.item.enrollment.id,'class-A');
  assert.equal(h.warnings.length,1,'Cache read failure should be observable');
}
{
  const h=harness({writeFail:true}),pending=h.load();
  h.caches[0].resolve(null);await tick();
  h.remotes[0].resolve([entry('class-A')]);await pending;
  assert.equal(h.state.item.enrollment.id,'class-A');
  assert.equal(h.state.error,null,'Cache write failure must not invalidate official result');
  assert.equal(h.warnings.length,1);
}
{
  const h=harness(),pending=h.load();
  h.caches[0].resolve(null);await tick();
  h.remotes[0].reject(new Error('no internet'));await pending;
  assert.equal(h.state.item,null);
  assert.equal(h.state.error,'No se pudo cargar la clase.');
  assert.equal(h.state.loadedForKey,h.detailKey);
  assert.equal(h.state.loading,false);
}
{
  const h=harness({enrollmentId:''});
  await h.load();
  assert.equal(h.caches.length,0);
  assert.equal(h.state.error,'No se indicó qué clase consultar.');
  assert.equal(h.state.loading,false);
}
{
  const h=harness(),pending=h.load();
  h.caches[0].resolve(null);await tick();
  h.remotes[0].resolve([entry('class-A','active')]);await tick();
  assert.equal(h.sessions.length,1);
  h.activeDetailKeyRef.current='A:class-B';
  h.loadRunRef.current++;
  h.sessions[0].resolve({'class-A':{dateKey:'2026-10-25'}});
  await pending;
  assert.equal(h.state.nextSession,null,'Old next-session response must not reach another class');
}

for(const token of [
  'const item = loadedForKey === detailKey ? storedItem : null',
  'activeDetailKeyRef.current === detailKey',
  'const runId = ++loadRunRef.current',
  'if (!isCurrentRun()) return;',
  'setLoadedForKey(detailKey)',
  'setLoadedForKey(null)',
  'setItem(null)',
  'return () => { loadRunRef.current += 1; }',
  '!loading && !error && item ? (',
])assert.ok(source.includes(token),'Class detail isolation missing: '+token);
console.log('UCAPSA client class detail: account, class, cache, concurrent responses, offline and next-session guards PASS');
