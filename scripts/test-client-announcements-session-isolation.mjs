import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/(tabs)/announcements.tsx','utf8');
const parsed=ts.createSourceFile('announcements.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
let initializer;
function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(parsed)==='loadAnnouncements')initializer=node.initializer;
  ts.forEachChild(node,visit);
}
visit(parsed);
assert.ok(initializer&&ts.isCallExpression(initializer),'Need actual announcements loader');
const callback=initializer.arguments[0];
assert.ok(callback&&ts.isArrowFunction(callback),'Need async callback from production component');
const transpiled=ts.transpileModule('exports.makeLoad=()=>('+callback.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(scope='A'){
  const calls={cache:[],home:[],remote:[],write:[]};
  const state={storedAnnouncements:['old'],loadedForScope:'old',
    selectedAnnouncement:{scope:'old',item:{title:'old private'}},
    readyForScope:'old',savedAt:'old',usingSavedData:false,offlineEmpty:false};
  const loadRunRef={current:0},activeScopeRef={current:scope};
  const exports={};
  vm.runInNewContext(transpiled,{
    exports,cacheScope:scope,loadRunRef,activeScopeRef,Error,
    setAnnouncements:v=>state.storedAnnouncements=v,
    setLoadedForScope:v=>state.loadedForScope=v,
    setReadyForScope:v=>state.readyForScope=v,
    setSelectedAnnouncement:v=>state.selectedAnnouncement=v,
    setSavedAt:v=>state.savedAt=v,
    setUsingSavedData:v=>state.usingSavedData=v,
    setOfflineEmpty:v=>state.offlineEmpty=v,
    readClientResource:()=>{const p=deferred();calls.cache.push(p);return p.promise;},
    readHomeCache:()=>{const p=deferred();calls.home.push(p);return p.promise;},
    getVisibleAnnouncements:()=>{const p=deferred();calls.remote.push(p);return p.promise;},
    writeClientResource:()=>{const p=deferred();calls.write.push(p);return p.promise;},
    withOperationTimeout:p=>p,
    DEFAULT_READ_TIMEOUT_MS:6000,
    clientReadKeys:{announcements:'announcements'},
  });
  return {load:exports.makeLoad(),state,calls,loadRunRef,activeScopeRef,scope};
}
async function tick(){for(let i=0;i<8;i++)await Promise.resolve();}
function settleCache(h,i,data=null){
  h.calls.cache[i].resolve(data?{data,saved_at:'cache-date'}:null);
  h.calls.home[i].resolve(null);
}
async function check(){
  // First account's cache is delayed until another account is active.
  {
    const h=harness();const a=h.load();
    h.activeScopeRef.current='B';h.loadRunRef.current++;
    settleCache(h,0,[{id:'private-A'}]);await a;
    assert.equal(h.calls.remote.length,0);
    assert.equal(h.state.loadedForScope,null);
    assert.deepEqual(h.state.storedAnnouncements,[]);
  }
  // A late first refresh cannot replace the second refresh's data.
  {
    const h=harness();const a=h.load(),b=h.load();
    settleCache(h,1);await tick();
    assert.equal(h.calls.remote.length,1);
    h.calls.remote[0].resolve([{id:'latest'}]);await tick();
    h.calls.write[0].resolve({saved_at:'now'});await b;
    settleCache(h,0,[{id:'stale'}]);await a;
    assert.equal(h.state.storedAnnouncements[0].id,'latest');
    assert.equal(h.state.loadedForScope,'A');
    assert.equal(h.state.readyForScope,'A');
  }
  // Offline mode may use a cache, but only inside the current scope.
  {
    const h=harness();const p=h.load();
    settleCache(h,0,[{id:'offline'}]);await tick();
    h.calls.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.storedAnnouncements[0].id,'offline');
    assert.equal(h.state.usingSavedData,true);
    assert.equal(h.state.offlineEmpty,false);
  }
  // Cache failures must not stop fresh announcements.
  {
    const h=harness();const p=h.load();
    h.calls.cache[0].reject(new Error('storage'));
    h.calls.home[0].reject(new Error('storage'));
    await tick();
    assert.equal(h.calls.remote.length,1);
    h.calls.remote[0].resolve([{id:'online'}]);await tick();
    h.calls.write[0].resolve({saved_at:'now'});await p;
    assert.equal(h.state.storedAnnouncements[0].id,'online');
  }
  // Remote updates from an unfocused screen are ignored.
  {
    const h=harness();const p=h.load();
    settleCache(h,0,[{id:'cache-A'}]);await tick();
    h.loadRunRef.current++;
    h.calls.remote[0].resolve([{id:'late'}]);await p;
    assert.equal(h.state.storedAnnouncements[0].id,'cache-A');
    assert.equal(h.calls.write.length,0);
  }
  // No cached data and failed network must display an explicit offline state.
  {
    const h=harness();const p=h.load();
    settleCache(h,0);await tick();
    h.calls.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.offlineEmpty,true);
    assert.equal(h.state.loadedForScope,'A');
    assert.deepEqual(h.state.storedAnnouncements,[]);
  }
  for(const token of [
    'const announcements = loadedForScope === cacheScope ? storedAnnouncements : [];',
    'selectedAnnouncement?.scope === cacheScope',
    'const localReady = readyForScope === cacheScope;',
    'const usingSavedData = loadedForScope === cacheScope && storedUsingSavedData;',
    'return () => { loadRunRef.current += 1; };',
    'if (!isCurrentRun()) return;',
    'Promise.allSettled',
    'setSelectedAnnouncement({ scope: cacheScope, item: announcement })',
    'visible={Boolean(activeSelectedAnnouncement)}',
  ]) assert.ok(source.includes(token),'Announcement privacy/loading guard missing: '+token);
  assert.equal((source.match(/setSelectedAnnouncement\(\{ scope: cacheScope, item: announcement \}\)/g)||[]).length,2);
}
await check();
console.log('UCAPSA announcements: stale sessions/refreshes, offline caches, cache failure, modal scope, blur and empty states PASS');
