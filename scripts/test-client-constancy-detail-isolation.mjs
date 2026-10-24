import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/client/competition-constancy.tsx','utf8');
const parsed=ts.createSourceFile('competition-constancy.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Constancy TSX parse errors');
let initializer;
function walk(node) {
  if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') initializer=node.initializer;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Actual constancy load useCallback missing');
const arrow=initializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow),'Expected actual async load callback');
const compiled=ts.transpileModule('exports.fn = ('+arrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness({userId='A',dogId='dog1',seasonId='season1'}={}) {
  const detailKey=[userId,dogId,seasonId].join(':');
  const activeDetailKeyRef={current:detailKey},loadRunRef={current:0};
  const state={detail:null,loadedKey:null,readyKey:null,usingSaved:false,savedAt:null,error:null};
  const cache=[],network=[],warnings=[];
  const exports={};
  vm.runInNewContext(compiled,{
    exports,Error,userId,dogId,seasonId,detailKey,isAdmin:false,activeDetailKeyRef,loadRunRef,
    setStoredDetail:v=>state.detail=v,
    setLoadedForKey:v=>state.loadedKey=v,
    setReadyForKey:v=>state.readyKey=v,
    setError:v=>state.error=v,
    setUsingSavedData:v=>state.usingSaved=v,
    setSavedAt:v=>state.savedAt=v,
    getCachedMyConstancyDetail:()=>{const d=deferred();cache.push(d);return d.promise;},
    refreshMyConstancyDetail:()=>{const d=deferred();network.push(d);return d.promise;},
    devWarn:(...args)=>warnings.push(args),
  });
  return {load:exports.fn,cache,network,state,warnings,activeDetailKeyRef,loadRunRef,detailKey};
}
const result=label=>({data:{dog_id:'dog1',season:{season_id:'season1',season_name:label},
  events:[]},saved_at:label});
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}
async function test() {
  {
    const h=harness();const p=h.load();
    h.activeDetailKeyRef.current='B:dog2:season2';h.loadRunRef.current++;
    h.cache[0].resolve(result('private-old'));await p;
    assert.equal(h.state.detail,null);
    assert.equal(h.network.length,0);
  }
  {
    const h=harness();const stale=h.load(),latest=h.load();
    h.cache[1].resolve(null);await flush();
    h.network[0].resolve(result('new'));await latest;
    h.cache[0].resolve(result('old'));await stale;
    assert.equal(h.state.detail.season.season_name,'new');
    assert.equal(h.state.loadedKey,h.detailKey);
    assert.equal(h.state.readyKey,h.detailKey);
  }
  {
    const h=harness();const p=h.load();
    h.cache[0].resolve(result('offline'));await flush();
    h.network[0].reject(new Error('network'));await p;
    assert.equal(h.state.detail.season.season_name,'offline');
    assert.equal(h.state.usingSaved,true);
    assert.equal(h.state.error,null);
  }
  {
    const h=harness();const p=h.load();
    h.cache[0].reject(new Error('corrupt-cache'));await flush();
    assert.equal(h.network.length,1);
    h.network[0].resolve(result('official'));await p;
    assert.equal(h.state.detail.season.season_name,'official');
    assert.equal(h.warnings.length,1);
  }
  {
    const h=harness();const p=h.load();
    h.cache[0].resolve(null);await flush();
    h.network[0].reject(new Error('offline'));await p;
    assert.equal(h.state.detail,null);
    assert.equal(h.state.error,'offline');
  }
  {
    const h=harness();const p=h.load();
    h.cache[0].resolve(result('cache'));await flush();
    h.activeDetailKeyRef.current='A:dog2:season2';h.loadRunRef.current++;
    h.network[0].resolve(result('late-server'));await p;
    assert.equal(h.state.detail.season.season_name,'cache');
  }
  for(const token of [
    'const detail = detailKey && loadedForKey === detailKey ? storedDetail : null',
    'activeDetailKeyRef.current === detailKey',
    'const runId = ++loadRunRef.current',
    'return () => {',
    'loadRunRef.current += 1;',
    'detail.dog_id !== dogId',
    'season?.season_id !== seasonId',
    "recordValueExposure(userId, detail.dog_id, season.season_id, 'constancy_detail')",
    'usingSavedData && detail',
  ]) assert.ok(source.includes(token),'Missing privacy/constancy invariant: '+token);
}
await test();
console.log('UCAPSA Constancia client subtab PASS: real async callbacks, account/dog/season guard, stale-response, offline fallback, and exposure provenance.');
