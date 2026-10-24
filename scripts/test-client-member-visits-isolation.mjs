import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/client/member-visits.tsx','utf8');
const parsed=ts.createSourceFile('member-visits.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Member visits TSX must parse.');
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') initializer=node.initializer;
  ts.forEachChild(node,visit);
}
visit(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Expected the actual load callback');
const arrow=initializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow),'Expected async load callback');
const compiled=ts.transpileModule('exports.makeLoad = () => ('+arrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function defer(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(userId='A'){
  const cache=[],remote=[],warnings=[];
  const activeUserIdRef={current:userId},loadRunRef={current:0};
  const state={visits:[],loadedFor:null,error:null,loading:true,savedAt:null,usingSaved:false};
  const exports={};
  vm.runInNewContext(compiled,{
    exports,Error,userId,isAdmin:false,activeUserIdRef,loadRunRef,
    setError:v=>state.error=v,
    setLoading:v=>state.loading=v,
    setStoredVisits:v=>state.visits=v,
    setLoadedForUserId:v=>state.loadedFor=v,
    setSavedAt:v=>state.savedAt=v,
    setUsingSavedData:v=>state.usingSaved=v,
    getCachedMyMemberVisits:()=>{
      const d=defer();cache.push(d);return d.promise;
    },
    getMyMemberVisits:()=>{
      const d=defer();remote.push(d);return d.promise;
    },
    devWarn:(...args)=>warnings.push(args),
  });
  return {load:exports.makeLoad(),state,cache,remote,warnings,activeUserIdRef,loadRunRef,userId};
}
async function spin(){for(let i=0;i<6;i++)await Promise.resolve();}
async function tests(){
  // A cached response from another account must be discarded before rendering or network read.
  {
    const h=harness();const p=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.cache[0].resolve({data:[{id:'private-A'}],saved_at:'yesterday'});
    await p;
    assert.equal(h.state.visits.length,0);
    assert.equal(h.state.loadedFor,null);
    assert.equal(h.remote.length,0);
  }
  // Old refresh must not override newer results for the same user.
  {
    const h=harness();const slow=h.load(),fast=h.load();
    h.cache[1].resolve(null);await spin();
    h.remote[0].resolve([{id:'new'}]);await fast;
    h.cache[0].resolve({data:[{id:'old'}],saved_at:'old'});await slow;
    assert.equal(h.state.visits[0].id,'new');
    assert.equal(h.state.loadedFor,'A');
    assert.equal(h.state.loading,false);
  }
  // Cache is allowed only for the current account if the network fails.
  {
    const h=harness();const p=h.load();
    h.cache[0].resolve({data:[{id:'cached-A'}],saved_at:'yesterday'});await spin();
    assert.equal(h.state.loadedFor,'A');
    h.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.visits[0].id,'cached-A');
    assert.equal(h.state.usingSaved,true);
  }
  // Cache read failure should not block remote recovery.
  {
    const h=harness();const p=h.load();
    h.cache[0].reject(new Error('cache failure'));await spin();
    assert.equal(h.remote.length,1);
    h.remote[0].resolve([{id:'remote'}]);await p;
    assert.equal(h.state.visits[0].id,'remote');
    assert.equal(h.warnings.length,1);
  }
  // Without cache and network, no old visit count remains.
  {
    const h=harness();const p=h.load();
    h.cache[0].resolve(null);await spin();
    h.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.visits.length,0);
    assert.equal(h.state.loadedFor,null);
    assert.equal(h.state.error,'No pudimos cargar tus visitas de socio.');
    assert.equal(h.state.loading,false);
  }
  // Old remote response must not replace newer account data.
  {
    const h=harness();const p=h.load();
    h.cache[0].resolve(null);await spin();
    h.activeUserIdRef.current='B';
    h.remote[0].resolve([{id:'private-A'}]);await p;
    assert.equal(h.state.visits.length,0);
    assert.equal(h.state.loadedFor,null);
  }
  for(const token of [
    'const visits = loadedForUserId === userId ? storedVisits : []',
    'activeUserIdRef.current === userId',
    'setStoredVisits([])',
    'setLoadedForUserId(null)',
    'setLoadedForUserId(userId)',
    'if (!isCurrentRun()) return;',
    'return () => { loadRunRef.current += 1; }',
    "getCachedMyMemberVisits(userId)",
    "getMyMemberVisits(userId)",
  ]) assert.ok(source.includes(token),'Member visit account guard missing: '+token);
}
await tests();
console.log('UCAPSA member visits: account isolation, stale cache/network, offline fallback, concurrent refresh and errors PASS');
