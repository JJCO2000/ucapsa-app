import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = 'src/app/client/competition-dog.tsx';
const source = fs.readFileSync(path,'utf8');
const ast = ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,
  ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
const callbacks={};
function walk(node) {
  if(ts.isVariableDeclaration(node)&&['load','applySnapshot'].includes(node.name.getText(ast))) {
    assert.ok(node.initializer && ts.isCallExpression(node.initializer));
    const arrow=node.initializer.arguments[0];
    assert.ok(arrow&&ts.isArrowFunction(arrow));
    callbacks[node.name.getText(ast)]=arrow.getText(ast);
  }
  ts.forEachChild(node,walk);
}
walk(ast);
assert.ok(callbacks.load && callbacks.applySnapshot,'Use production callbacks, not simplified substitutes');
const js=ts.transpileModule(
  'exports.makeLoad = () => ('+callbacks.load+');\n'
  +'exports.makeApply = () => ('+callbacks.applySnapshot+');',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred(){let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return{promise,resolve,reject};}
function fixture(dogName, season='current') {
  return { data: { dog_id: dogName, dog_name: dogName,
    seasons: [{season_id:season,season_status:'active'}], official_exams:[] }, saved_at:'saved-'+dogName };
}
function harness({userId='A',dogId='dogA',isAdmin=false}={}){
  const scopeKey=!isAdmin&&userId&&dogId?userId+':'+dogId:'';
  const activeScopeKeyRef={current:scopeKey},loadRunRef={current:0};
  const state={snapshot:null,loadedForKey:null,readyForKey:null,season:null,error:null,
    usingSavedData:false,savedAt:null};
  const cache=[],remote=[],warnings=[],exports={};
  const setter=(key,value)=>{
    state[key]=typeof value==='function'?value(state[key]):value;
  };
  const ctx={
    exports,Error,userId,dogId,isAdmin,scopeKey,activeScopeKeyRef,loadRunRef,
    setStoredSnapshot:v=>setter('snapshot',v),
    setLoadedForKey:v=>setter('loadedForKey',v),
    setReadyForKey:v=>setter('readyForKey',v),
    setSelectedSeason:v=>setter('season',v),
    setError:v=>setter('error',v),
    setUsingSavedData:v=>setter('usingSavedData',v),
    setSavedAt:v=>setter('savedAt',v),
    devWarn:(...args)=>warnings.push(args),
    getCachedMyDogCompetition:()=>{
      const d=deferred();cache.push(d);return d.promise;
    },
    refreshMyDogCompetition:()=>{
      const d=deferred();remote.push(d);return d.promise;
    },
  };
  vm.runInNewContext(js,ctx);
  const applySnapshot=exports.makeApply();
  vm.runInNewContext('exports.makeLoad2 = () => ('+callbacks.load+');', {...ctx,applySnapshot});
  return{load:exports.makeLoad2(),state,cache,remote,warnings,
    loadRunRef,activeScopeKeyRef,scopeKey,applySnapshot};
}
async function microtasks(){for(let i=0;i<6;i++)await Promise.resolve();}
async function run(){
  {
    const h=harness();const promise=h.load();
    h.activeScopeKeyRef.current='B:dogB';h.loadRunRef.current++;
    h.cache[0].resolve(fixture('Private A'));await promise;
    assert.equal(h.remote.length,0,'Stale cache must not trigger network call');
    assert.equal(h.state.snapshot,null);
    assert.equal(h.state.readyForKey,null);
  }
  {
    const h=harness();const older=h.load(),newer=h.load();
    h.cache[1].resolve(null);await microtasks();
    assert.equal(h.remote.length,1);
    h.remote[0].resolve(fixture('current dog'));await newer;
    h.cache[0].resolve(fixture('old dog'));await older;
    assert.equal(h.state.snapshot.dog_name,'current dog');
    assert.equal(h.state.loadedForKey,h.scopeKey);
    assert.equal(h.state.readyForKey,h.scopeKey);
    assert.equal(h.state.season.key,h.scopeKey);
  }
  {
    const h=harness();const promise=h.load();
    h.cache[0].resolve(fixture('offline dog'));await microtasks();
    assert.equal(h.state.snapshot.dog_name,'offline dog');
    h.remote[0].reject(new Error('sin internet'));await promise;
    assert.equal(h.state.usingSavedData,true);
    assert.equal(h.state.snapshot.dog_name,'offline dog');
    assert.equal(h.state.error,null);
  }
  {
    const h=harness();const promise=h.load();
    h.cache[0].reject(new Error('corrupt cache'));await microtasks();
    assert.equal(h.remote.length,1,'Broken local cache must not block official data');
    h.remote[0].resolve(fixture('official dog'));await promise;
    assert.equal(h.state.snapshot.dog_name,'official dog');
    assert.equal(h.warnings.length,1);
    assert.equal(h.state.error,null);
  }
  {
    const h=harness();const promise=h.load();
    h.cache[0].resolve(null);await microtasks();
    h.remote[0].reject(new Error('offline'));await promise;
    assert.equal(h.state.snapshot,null);
    assert.equal(h.state.loadedForKey,null);
    assert.equal(h.state.readyForKey,h.scopeKey);
    assert.match(h.state.error,/No pudimos cargar la competencia/);
  }
  {
    const h=harness();const promise=h.load();
    h.cache[0].resolve(fixture('dog A','seasonA'));await microtasks();
    h.activeScopeKeyRef.current='A:dogB';h.loadRunRef.current++;
    h.remote[0].resolve(fixture('dog B','seasonB'));await promise;
    assert.equal(h.state.snapshot.dog_name,'dog A','Late dog B must not overwrite old scope cache');
    assert.equal(h.state.season.id,'seasonA');
  }
  {
    const h=harness();h.applySnapshot(fixture('dog A','seasonA').data);
    assert.equal(h.state.season.key,h.scopeKey);
    assert.equal(h.state.season.id,'seasonA');
    h.state.season={key:'B:dogB',id:'not-a-season'};
    h.applySnapshot(fixture('dog A','seasonCurrent').data);
    assert.equal(h.state.season.id,'seasonCurrent','Never reuse selected season from another scope');
  }
  {
    const h=harness({dogId:''});await h.load();
    assert.equal(h.cache.length,0);
    assert.equal(h.state.error,'No encontramos este perro.');
    assert.equal(h.state.readyForKey,'');
  }

  for(const token of [
    'const snapshot = scopeKey && loadedForKey === scopeKey ? storedSnapshot : null;',
    'const selectedSeasonId = selectedSeasonChoice?.key === scopeKey ? selectedSeasonChoice.id : null;',
    'activeScopeKeyRef.current === scopeKey',
    'if (!isCurrentRun()) return;',
    'setLoadedForKey(null)',
    'setReadyForKey(null)',
    'setSelectedSeason({ key: scopeKey, id: season.season_id })',
    'return () => {',
    'loadRunRef.current += 1;',
    'usingSavedData && snapshot',
    'if (!user || isAdmin || !screenFocused || !localReady || error || !snapshot?.dog_id',
  ]) assert.ok(source.includes(token),'Competition detail scope safeguard absent: '+token);
  console.log('UCAPSA client competition dog isolation: user/dog switches, concurrent loads, season selection, cache failures, offline data and tracking guards PASS');
}
await run();
