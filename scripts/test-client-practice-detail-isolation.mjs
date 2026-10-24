import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/client/practice-detail.tsx','utf8');
const ast=ts.createSourceFile('practice-detail.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(d=>d.messageText).join('; '));
let loadDeclaration;
function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='load') loadDeclaration=node;
  ts.forEachChild(node,visit);
}
visit(ast);
assert.ok(loadDeclaration&&ts.isCallExpression(loadDeclaration.initializer),'Missing real practice detail load');
const arrow=loadDeclaration.initializer.arguments[0];
assert.ok(arrow&&ts.isArrowFunction(arrow),'Real practice detail callback must be an arrow');
const compiled=ts.transpileModule('exports.makeLoad = () => ('+arrow.getText(ast)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness({userId='A',practiceId='practice-1',isAdmin=false}={}){
  const detailKey=!isAdmin&&userId&&practiceId?[userId,practiceId].join(':'):'';
  const activeDetailKeyRef={current:detailKey},loadRunRef={current:0};
  const state={entry:{id:'old'},activity:{entries:[{id:'old'}]},loadedForKey:'OLD',
    loading:false,error:null,usingSavedData:false};
  const caches=[],remote=[],warnings=[],exports={};
  vm.runInNewContext(compiled,{
    exports,Error,userId,practiceId,isAdmin,detailKey,activeDetailKeyRef,loadRunRef,
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    setEntry:v=>state.entry=v,
    setActivity:v=>state.activity=v,
    setLoadedForKey:v=>state.loadedForKey=v,
    setUsingSavedData:v=>state.usingSavedData=v,
    getCachedMyPracticeActivity:()=>{const d=deferred();caches.push(d);return d.promise;},
    getMyPracticeActivity:()=>{const d=deferred();remote.push(d);return d.promise;},
    devWarn:(...args)=>warnings.push(args),
  });
  return {load:exports.makeLoad(),state,caches,remote,warnings,
    detailKey,activeDetailKeyRef,loadRunRef};
}
const snapshot=(id,source='remote')=>({entries:[{id,dogName:'Prueba',syncStatus:'synced'}],
  source,savedAt:'2026-10-23T00:00:00Z'});
async function tick(){for(let i=0;i<4;i++)await Promise.resolve();}
async function run(){
  {
    const h=harness();const p=h.load();
    assert.equal(h.state.entry,null);
    assert.equal(h.state.activity,null);
    h.activeDetailKeyRef.current='B:practice-2';
    h.caches[0].resolve(snapshot('practice-1','local'));await p;
    assert.equal(h.remote.length,0);
    assert.equal(h.state.entry,null,'Stale account cache cannot be displayed');
  }
  {
    const h=harness();const first=h.load(),second=h.load();
    h.caches[1].resolve(null);await tick();
    h.remote[0].resolve(snapshot('practice-1'));await second;
    h.caches[0].resolve(snapshot('old','local'));await first;
    assert.equal(h.state.entry.id,'practice-1');
    assert.equal(h.state.loadedForKey,h.detailKey);
  }
  {
    const h=harness();const p=h.load();
    h.caches[0].resolve(snapshot('practice-1','local'));await tick();
    h.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.entry.id,'practice-1');
    assert.equal(h.state.usingSavedData,true);
    assert.equal(h.state.error,null);
  }
  {
    const h=harness();const p=h.load();
    h.caches[0].reject(new Error('broken cache'));await tick();
    assert.equal(h.remote.length,1);
    h.remote[0].resolve(snapshot('practice-1'));await p;
    assert.equal(h.state.entry.id,'practice-1');
    assert.equal(h.warnings.length,1);
    assert.equal(h.state.usingSavedData,false);
  }
  {
    const h=harness();const p=h.load();
    h.caches[0].resolve(snapshot('practice-1','local'));await tick();
    h.remote[0].resolve(snapshot('another'));await p;
    assert.equal(h.state.entry,null,'Missing remote record should never keep stale cache entry');
    assert.match(h.state.error,/No encontramos esta práctica/);
  }
  {
    const h=harness();const p=h.load();
    h.caches[0].resolve(null);await tick();
    h.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.entry,null);
    assert.match(h.state.error,/No pudimos cargar esta práctica/);
  }
  {
    const h=harness({practiceId:null});await h.load();
    assert.equal(h.caches.length,0);
    assert.match(h.state.error,/No se indicó/);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const p=h.load();
    h.caches[0].resolve(snapshot('practice-1','local'));await tick();
    h.activeDetailKeyRef.current='A:other-practice';
    h.loadRunRef.current++;
    h.remote[0].resolve(snapshot('practice-1'));await p;
    assert.equal(h.state.activity.source,'local','Late response must never override saved same-practice content');
  }
  for(const token of [
    'const entry = detailKey && loadedForKey === detailKey ? storedEntry : null;',
    'const activity = detailKey && loadedForKey === detailKey ? storedActivity : null;',
    'activeDetailKeyRef.current === detailKey',
    'setEntry(null)',
    'setActivity(null)',
    'setLoadedForKey(null)',
    'if (!isCurrentRun()) return;',
    'return () => { loadRunRef.current += 1; };',
    '!loading && !error && entry',
  ])assert.ok(source.includes(token),'Missing practice detail privacy guard: '+token);
  console.log('UCAPSA client practice detail: stale session, changed entry, concurrent cache/remote, offline fallback, missing record and route guard PASS');
}
await run();
