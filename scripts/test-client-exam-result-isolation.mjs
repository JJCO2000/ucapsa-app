import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/client/competition-exam-result.tsx','utf8');
const parsed = ts.createSourceFile('competition-exam-result.tsx',source,
  ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let initializer;
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') {
    initializer=node.initializer;
  }
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Expected real load callback');
const callback=initializer.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback),'Expected an async load arrow');
const compiled=ts.transpileModule('exports.makeLoad = () => ('+callback.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function deferred() {
  let resolve, reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness({userId='A',dogId='dog1',attemptId='exam1',isAdmin=false}={}) {
  const resultKey=(!isAdmin && userId && dogId && attemptId)
    ? [userId,dogId,attemptId].join(':') : '';
  const activeResultKeyRef={current:resultKey},loadRunRef={current:0};
  const state={storedDetail:null,loadedForKey:null,readyForKey:null,
    error:null,usingSavedData:false,savedAt:null};
  const local=[],remote=[],warnings=[];
  const exports={};
  vm.runInNewContext(compiled,{
    exports,Error,userId,dogId,attemptId,isAdmin,resultKey,activeResultKeyRef,loadRunRef,
    setStoredDetail:v=>state.storedDetail=v,
    setLoadedForKey:v=>state.loadedForKey=v,
    setReadyForKey:v=>state.readyForKey=v,
    setError:v=>state.error=v,
    setUsingSavedData:v=>state.usingSavedData=v,
    setSavedAt:v=>state.savedAt=v,
    getCachedMyOfficialExamDetail:()=>{
      const d=deferred();local.push(d);return d.promise;
    },
    refreshMyOfficialExamDetail:()=>{
      const d=deferred();remote.push(d);return d.promise;
    },
    devWarn:(...args)=>warnings.push(args),
  });
  return {load:exports.makeLoad(),state,local,remote,warnings,activeResultKeyRef,
    loadRunRef,resultKey};
}
const detail=(id)=>({data:{official:{exam_code:id},dog_name:'Dog '+id,
  results:[],items:[]},saved_at:id+'-date'});
async function microtasks() {for(let i=0;i<5;i++)await Promise.resolve();}

async function check() {
  {
    const h=harness();const pending=h.load();
    h.activeResultKeyRef.current='B:dog2:exam2';h.loadRunRef.current++;
    h.local[0].resolve(detail('A-private'));await pending;
    assert.equal(h.remote.length,0,'stale cache must never trigger a network read');
    assert.equal(h.state.storedDetail,null,'stale account cache must not be committed');
    assert.equal(h.state.readyForKey,null);
  }
  {
    const h=harness();const old=h.load(),recent=h.load();
    h.local[1].resolve(null);await microtasks();
    h.remote[0].resolve(detail('new'));await recent;
    h.local[0].resolve(detail('old'));await old;
    assert.equal(h.state.storedDetail.official.exam_code,'new');
    assert.equal(h.state.loadedForKey,h.resultKey);
    assert.equal(h.state.readyForKey,h.resultKey);
    assert.equal(h.remote.length,1);
  }
  {
    const h=harness();const pending=h.load();
    h.local[0].resolve(detail('offline'));await microtasks();
    assert.equal(h.state.loadedForKey,h.resultKey);
    h.remote[0].reject(new Error('sin internet'));await pending;
    assert.equal(h.state.storedDetail.official.exam_code,'offline');
    assert.equal(h.state.usingSavedData,true);
    assert.equal(h.state.error,null);
  }
  {
    const h=harness();const pending=h.load();
    h.local[0].reject(new Error('cache corrupta'));await microtasks();
    assert.equal(h.remote.length,1,'local failure must not block server refresh');
    h.remote[0].resolve(detail('official'));await pending;
    assert.equal(h.state.storedDetail.official.exam_code,'official');
    assert.equal(h.state.error,null);
    assert.equal(h.warnings.length,1);
  }
  {
    const h=harness();const pending=h.load();
    h.local[0].resolve(null);await microtasks();
    h.remote[0].reject(new Error('offline'));await pending;
    assert.equal(h.state.storedDetail,null);
    assert.equal(h.state.loadedForKey,null);
    assert.equal(h.state.error,'offline');
    assert.equal(h.state.readyForKey,h.resultKey);
  }
  {
    const h=harness();const pending=h.load();
    h.local[0].resolve(detail('cache'));await microtasks();
    h.activeResultKeyRef.current='A:another-dog:exam1';
    h.loadRunRef.current++;
    h.remote[0].resolve(detail('late-remote'));await pending;
    assert.equal(h.state.storedDetail.official.exam_code,'cache',
      'outdated remote response must not replace the earlier cached result');
  }
  {
    const h=harness({dogId:''});await h.load();
    assert.equal(h.local.length,0);
    assert.equal(h.state.error,'Falta identificar el examen oficial solicitado.');
    assert.equal(h.state.readyForKey,'');
  }

  for (const token of [
    'const detail = resultKey && loadedForKey === resultKey ? storedDetail : null;',
    'activeResultKeyRef.current === resultKey',
    'const runId = ++loadRunRef.current',
    'if (!isCurrentRun()) return;',
    'setStoredDetail(null)',
    'setLoadedForKey(null)',
    'setReadyForKey(null)',
    'return () => { loadRunRef.current += 1; };',
    'usingSavedData && detail',
    'localReady && !error && detail',
  ]) assert.ok(source.includes(token),'Missing account/exam isolation contract: '+token);
}
await check();
console.log('UCAPSA official exam result: stale user/dog/attempt, concurrent refresh, cache/network errors, offline fallback and render isolation PASS');
