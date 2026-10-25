import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production load callback, not a duplicated implementation.
const source=fs.readFileSync('src/app/client/activity-achievements.tsx','utf8');
const parsed=ts.createSourceFile('activity-achievements.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Invalid TSX syntax');
let initializer;
function visit(node){
  if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load')initializer=node.initializer;
  ts.forEachChild(node,visit);
}
visit(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Production load callback missing');
const callback=initializer.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback),'Expected arrow callback');
const transpiled=ts.transpileModule('exports.makeLoad = () => ('+callback.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function makeHarness({userId='A',scopedDogId=null}={}){
  const scopeKey=userId+':'+(scopedDogId || 'all');
  const activeScopeRef={current:scopeKey},loadRunRef={current:0};
  const state={facts:'previous',loadedFor:'previous',error:null,loading:true,usingSaved:false,savedAt:null};
  const cache=[],remote=[],warnings=[];
  const exports={};
  vm.runInNewContext(transpiled,{
    exports,Error,userId,scopeKey,scopedDogId,isAdmin:false,loadRunRef,activeScopeRef,
    setError:v=>{state.error=v;},
    setLoading:v=>{state.loading=v;},
    setFacts:v=>{state.facts=v;},
    setLoadedForKey:v=>{state.loadedFor=v;},
    setSavedAt:v=>{state.savedAt=v;},
    setUsingSavedData:v=>{state.usingSaved=v;},
    getCachedMyClientActivityFacts:()=>{const item=deferred();cache.push(item);return item.promise;},
    getCachedDogActivityFacts:()=>{const item=deferred();cache.push(item);return item.promise;},
    getMyClientActivityFacts:()=>{const item=deferred();remote.push(item);return item.promise;},
    getMyDogActivityFacts:()=>{const item=deferred();remote.push(item);return item.promise;},
    devWarn:(...parts)=>{warnings.push(parts);},
  });
  return {load:exports.makeLoad(),state,cache,remote,warnings,activeScopeRef,loadRunRef,scopeKey};
}
async function flush(){for(let n=0;n<6;n++)await Promise.resolve();}
const facts=(count)=>({attendanceTotal:count,practiceTotal:0,memberVisitsTotal:0,
  currentPracticeStreak:0,longestPracticeStreak:0});

{
  const h=makeHarness();const p=h.load();
  h.activeScopeRef.current='B:dog2';h.loadRunRef.current++;
  h.cache[0].resolve({data:facts(11),saved_at:'old'});await p;
  assert.equal(h.remote.length,0,'Stale cache must not trigger network fetch');
  assert.equal(h.state.loadedFor,null,'Stale cache must not become visible');
}
{
  const h=makeHarness();const older=h.load(),newest=h.load();
  h.cache[1].resolve(null);await flush();
  h.remote[0].resolve(facts(2));await newest;
  h.cache[0].resolve({data:facts(999),saved_at:'old'});await older;
  assert.equal(h.state.facts.attendanceTotal,2,'Older refresh may not override latest');
  assert.equal(h.state.loadedFor,h.scopeKey);
  assert.equal(h.state.loading,false);
}
{
  const h=makeHarness({scopedDogId:'dog1'});const p=h.load();
  h.cache[0].resolve({data:facts(7),saved_at:'cached'});await flush();
  assert.equal(h.state.loadedFor,h.scopeKey);
  h.remote[0].reject(new Error('offline'));await p;
  assert.equal(h.state.facts.attendanceTotal,7,'Offline may use same-dog cache');
  assert.equal(h.state.usingSaved,true);
  assert.equal(h.state.error,null);
}
{
  const h=makeHarness();const p=h.load();
  h.cache[0].reject(new Error('local cache unavailable'));await flush();
  assert.equal(h.remote.length,1,'Bad local cache must not suppress official refresh');
  h.remote[0].resolve(facts(5));await p;
  assert.equal(h.state.facts.attendanceTotal,5);
  assert.equal(h.warnings.length,1);
}
{
  const h=makeHarness();const p=h.load();
  h.cache[0].resolve(null);await flush();
  h.remote[0].reject(new Error('offline'));await p;
  assert.equal(h.state.facts,null);
  assert.equal(h.state.loadedFor,null);
  assert.equal(h.state.error,'No pudimos calcular tus insignias de actividad.');
  assert.equal(h.state.loading,false);
}
{
  const h=makeHarness();const p=h.load();
  h.cache[0].resolve(null);await flush();
  h.activeScopeRef.current='B:all';h.loadRunRef.current++;
  h.remote[0].resolve(facts(33));await p;
  assert.equal(h.state.loadedFor,null,'Late network response must not cross account boundary');
}
for(const token of [
  "const facts = scopeKey && loadedForKey === scopeKey ? storedFacts : null",
  "activeScopeRef.current === scopeKey",
  "setLoadedForKey(null)",
  "setLoadedForKey(scopeKey)",
  "return () => { loadRunRef.current += 1; };",
  "usingSavedData && facts",
])assert.ok(source.includes(token),'Missing account/dog render or request isolation: '+token);
console.log('UCAPSA activity-achievements isolation: user/dog switch, cache failure, stale requests, latest refresh, offline fallback PASS');
