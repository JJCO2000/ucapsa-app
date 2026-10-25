import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/client/competition-ranking.tsx','utf8');
const parsed=ts.createSourceFile('competition-ranking.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let initializer;
function walk(node) {
  if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load')initializer=node.initializer;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Expected actual load callback');
const arrow=initializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow));
const js=ts.transpileModule('exports.makeLoad=()=>('+arrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(){
  const userId='A',seasonId='S1',isAdmin=false,resultKey=JSON.stringify([userId,seasonId]);
  const activeResultKeyRef={current:resultKey},loadRunRef={current:0};
  const state={loadedForKey:null,rows:[],myCompetition:null,scoreUnavailable:false,
    requiredExams:null,myDogs:[],localReady:false,error:null,
    usingSavedData:false,savedAt:null};
  const cache=[],network=[],photos=[],warnings=[];
  const setterNames={
    setLoadedForKey:'loadedForKey',setRows:'rows',
    setMyCompetition:'myCompetition',setScoreUnavailable:'scoreUnavailable',
    setRequiredExams:'requiredExams',setMyDogs:'myDogs',
    setLocalReady:'localReady',setError:'error',
    setUsingSavedData:'usingSavedData',setSavedAt:'savedAt',
  };
  const context={exports:{},Error,userId,seasonId,isAdmin,resultKey,activeResultKeyRef,loadRunRef,
    DEFAULT_DOG_AVATAR_KEY:'paw',DEFAULT_DOG_AVATAR_COLOR:'blue',
    devWarn:(...args)=>warnings.push(args),
    getCachedCompetitionLeaderboard:()=>{const d=deferred();cache.push({kind:'ranking',...d});return d.promise;},
    getCachedMyCompetitionAccount:()=>{const d=deferred();cache.push({kind:'account',...d});return d.promise;},
    getCachedRequiredCompetitionExams:()=>{const d=deferred();cache.push({kind:'required',...d});return d.promise;},
    refreshCompetitionLeaderboard:()=>{const d=deferred();network.push({kind:'ranking',...d});return d.promise;},
    getMyDogs:()=>{const d=deferred();network.push({kind:'dogs',...d});return d.promise;},
    refreshMyCompetitionAccount:()=>{const d=deferred();network.push({kind:'account',...d});return d.promise;},
    refreshRequiredCompetitionExams:()=>{const d=deferred();network.push({kind:'required',...d});return d.promise;},
    getPrivateDogPhotoUrls:()=>{const d=deferred();photos.push(d);return d.promise;},
  };
  for(const [method,key] of Object.entries(setterNames)){
    context[method]=v=>{state[key]=typeof v==='function'?v(state[key]):v;};
  }
  vm.runInNewContext(js,context);
  return{load:context.exports.makeLoad(),state,cache,network,photos,warnings,
    activeResultKeyRef,loadRunRef,resultKey};
}
async function tick(){for(let i=0;i<7;i++)await Promise.resolve();}
const cacheAccount={data:{dogs:[{dog_id:'D1',dog_name:'Dog A'}],seasons:[]},saved_at:'old'};
function settleCache(h,at=0,{rank=null,account=null,required=null}={}){
  const list=h.cache.slice(at,at+3);
  assert.equal(list.length,3);
  list[0].resolve(rank);list[1].resolve(account);list[2].resolve(required);
}
function settleNetwork(h,at=0,{rank=null,account=null,dogs=[],required=null}={}){
  const list=h.network.slice(at,at+4);
  assert.equal(list.length,4);
  list[0].resolve(rank??{data:[{dog_id:'D1',season_name:'S1'}],saved_at:'now'});
  list[1].resolve(dogs);list[2].resolve(account??{data:{dogs:[],seasons:[]}});
  list[3].resolve(required??{data:[]});
}
async function test() {
  {
    const h=harness();const p=h.load();
    h.activeResultKeyRef.current='["B","S2"]';h.loadRunRef.current++;
    settleCache(h,0,{rank:{data:[{dog_id:'private-A'}],saved_at:'old'},account:cacheAccount});
    await p;
    assert.equal(h.network.length,0);
    assert.equal(h.state.rows.length,0);
    assert.equal(h.state.myDogs.length,0);
  }
  {
    const h=harness();const first=h.load(),second=h.load();
    settleCache(h,3);await tick();
    assert.equal(h.network.length,4);
    settleNetwork(h,0,{dogs:[]});
    await tick();assert.equal(h.photos.length,1);
    h.photos[0].resolve({});await second;
    settleCache(h,0,{rank:{data:[{dog_id:'stale'}],saved_at:'old'},account:cacheAccount});
    await first;
    assert.equal(h.state.rows[0].dog_id,'D1');
    assert.equal(h.state.loadedForKey,h.resultKey);
    assert.equal(h.state.myDogs.length,0);
    assert.equal(h.network.length,4);
  }
  {
    const h=harness();const p=h.load();settleCache(h);await tick();
    settleNetwork(h,0,{dogs:[{id:'private-dog',name:'My dog',avatar_key:'paw',avatar_color:'blue',photo_path:'secret.png'}]});
    await tick();assert.equal(h.photos.length,1);
    h.activeResultKeyRef.current='["B","S1"]';h.loadRunRef.current++;
    h.photos[0].resolve({'private-dog':'https://private.invalid/signed.jpg'});
    await p;
    assert.equal(h.state.myDogs.length,0,'late signed photo URL must not be rendered');
    assert.equal(h.state.rows.length,0,'late ranking must not be committed');
  }
  {
    const h=harness();const p=h.load();
    for(const d of h.cache)d.reject(new Error('no storage'));
    await tick();assert.equal(h.network.length,4);
    settleNetwork(h,0,{dogs:[]});await tick();
    h.photos[0].resolve({});await p;
    assert.equal(h.state.rows[0].dog_id,'D1');
    assert.equal(h.state.error,null);
    assert.equal(h.warnings.length,3);
  }
  {
    const h=harness();const p=h.load();
    settleCache(h,0,{rank:{data:[{dog_id:'offline'}],saved_at:'yesterday'},account:cacheAccount});
    await tick();
    for(const d of h.network)d.reject(new Error('offline'));
    await p;
    assert.equal(h.state.rows[0].dog_id,'offline');
    assert.equal(h.state.myDogs[0].photoUrl,null);
    assert.equal(h.state.usingSavedData,true);
    assert.equal(h.state.localReady,true);
  }
  for(const token of [
    'const rows = isCurrentResult ? storedRows : [];',
    'const myCompetition = isCurrentResult ? storedMyCompetition : null;',
    'const myDogs = isCurrentResult ? storedMyDogs : [];',
    'const resultKey = userId && !isAdmin && seasonId ? JSON.stringify([userId, seasonId])',
    'activeResultKeyRef.current === resultKey',
    'if (!isCurrentRun()) return;',
    'return () => { loadRunRef.current += 1; };',
    'const cachedRanking = rankingCacheResult.status',
    'setMyDogs(dogsResult.value.map',
  ])assert.ok(source.includes(token),'Missing Ranking account/season isolation: '+token);
}
await test();
console.log('UCAPSA Ranking account/season isolation: stale cache, concurrent loads, private photo URLs, offline fallback and storage failures PASS');
