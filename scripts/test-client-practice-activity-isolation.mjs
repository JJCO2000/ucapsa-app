import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real screen's asynchronous load function, not a copied imitation.
const source = fs.readFileSync('src/app/client/practice-activity.tsx', 'utf8');
const parsed = ts.createSourceFile('practice-activity.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let loadDeclaration;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') loadDeclaration=node;
  ts.forEachChild(node,visit);
}
visit(parsed);
assert.ok(loadDeclaration && ts.isCallExpression(loadDeclaration.initializer),'real load callback missing');
const loadArrow=loadDeclaration.initializer.arguments[0];
assert.ok(ts.isArrowFunction(loadArrow),'expected async load arrow');
const compiled=ts.transpileModule('exports.makeLoad = () => ('+loadArrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(userId='A') {
  const state={
    loadedFor:null,activity:'prior',program:'prior',targetDays:[1],
    loading:true,error:null,usingSaved:false,savedAt:null,modalOpen:true,
  };
  const cache=[],remote=[],savedGoals=[],programCache=[],writes=[],warnings=[];
  const loadRunRef={current:0},activeUserIdRef={current:userId};
  const exports={};
  vm.runInNewContext(compiled,{
    exports,Error,Promise,
    isAdmin:false,userId,loadRunRef,activeUserIdRef,
    setLoadedForUserId:v=>state.loadedFor=v,
    setActivity:v=>state.activity=v,
    setActiveProgram:v=>state.program=v,
    setTargetDays:v=>state.targetDays=v,
    setModalOpen:v=>state.modalOpen=v,
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    setUsingSavedData:v=>state.usingSaved=v,
    setSavedAt:v=>state.savedAt=v,
    DEFAULT_PRACTICE_TARGET_DAYS:[1,3,5],
    DEFAULT_READ_TIMEOUT_MS:3000,
    clientReadKeys:{programs:'programs'},
    getCachedMyPracticeActivity:()=>{const d=deferred();cache.push(d);return d.promise;},
    readClientResource:()=>{const d=deferred();programCache.push(d);return d.promise;},
    getPracticeTargetDays:()=>{const d=deferred();savedGoals.push(d);return d.promise;},
    getMyPracticeActivity:()=>{const d=deferred();remote.push(d);return d.promise;},
    getMyProgramEnrollments:()=>{const d=deferred();remote.push(d);return d.promise;},
    withOperationTimeout:p=>p,
    writeClientResource:(...args)=>{writes.push(args);return Promise.resolve({saved_at:'now'});},
    sanitizeProgramRowsForCache:rows=>rows,
    devWarn:(...args)=>warnings.push(args),
  });
  return {load:exports.makeLoad(),state,cache,remote,savedGoals,programCache,writes,warnings,
    loadRunRef,activeUserIdRef};
}
async function tick() {for(let i=0;i<10;i++)await Promise.resolve();}
function cacheResults(h,index,{activity=null,programs=null,days=[1,3]}={}) {
  h.cache[index].resolve(activity);
  h.programCache[index].resolve(programs);
  h.savedGoals[index].resolve(days);
}
const activity=(id,source='remote')=>({source,savedAt:'2026-10-01',stats:{currentStreak:1},entries:[{id}]});
const program=(id)=>({enrollment:{id,status:'active',dog_id:'dog-'+id}});
async function runTests() {
  // In-flight private reads from the previous account may not be committed.
  {
    const h=harness();const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    cacheResults(h,0,{activity:activity('A-private','cached')});
    await pending;
    assert.equal(h.remote.length,0);
    assert.equal(h.state.activity,null);
    assert.equal(h.state.program,null);
    assert.equal(h.state.targetDays.length,3);
  }
  // An older refresh must not overwrite a newer one, even after cache resolves late.
  {
    const h=harness();const old=h.load(),newer=h.load();
    cacheResults(h,1);
    await tick();
    assert.equal(h.remote.length,2);
    h.remote[0].resolve(activity('new'));
    h.remote[1].resolve([program('new')]);
    await newer;
    cacheResults(h,0,{activity:activity('stale','cached'),programs:{data:[program('stale')]}});
    await old;
    assert.equal(h.state.activity.entries[0].id,'new');
    assert.equal(h.state.program.enrollment.id,'new');
    assert.equal(h.state.loadedFor,'A');
    assert.equal(h.state.loading,false);
    assert.equal(h.writes.length,1);
  }
  // Corrupt cache/goal preference must not block remote, nor reuse private old data.
  {
    const h=harness();const pending=h.load();
    h.cache[0].reject(new Error('cache broken'));
    h.programCache[0].reject(new Error('program cache broken'));
    h.savedGoals[0].reject(new Error('goal cache broken'));
    await tick();
    assert.equal(h.remote.length,2);
    h.remote[0].resolve(activity('verified'));
    h.remote[1].resolve([program('verified')]);
    await pending;
    assert.equal(h.state.activity.entries[0].id,'verified');
    assert.equal(h.state.program.enrollment.id,'verified');
    assert.equal(h.state.targetDays.length,3);
    assert.equal(h.warnings.length,3);
  }
  // Offline fallback stays within the current account and discloses cache age.
  {
    const h=harness();const pending=h.load();
    cacheResults(h,0,{activity:activity('offline','cached'),
      programs:{data:[program('offline')],saved_at:'2026-10-01'},days:[2,4]});
    await tick();
    h.remote[0].reject(new Error('offline'));
    h.remote[1].reject(new Error('offline'));
    await pending;
    assert.equal(h.state.activity.entries[0].id,'offline');
    assert.equal(h.state.program.enrollment.id,'offline');
    assert.equal(h.state.usingSaved,true);
    assert.equal(h.state.targetDays.join(','),'2,4');
  }
  // Screen account guard: previous user's data and modal must not render.
  for (const token of [
    'activeUserIdRef.current === userId',
    'const currentUserReady = Boolean(userId && loadedForUserId === userId)',
    'const activity = currentUserReady ? storedActivity : null',
    'const activeProgram = currentUserReady ? storedActiveProgram : null',
    'const modalOpen = currentUserReady && storedModalOpen',
    'const targetDays = currentUserReady ? storedTargetDays : DEFAULT_PRACTICE_TARGET_DAYS',
    'if (!user || savingTarget || !currentUserReady || loading || error) return;',
    'if (activeUserIdRef.current !== requestUserId) return;',
    'if (!user || !currentUserReady || loading || error || !activeProgram',
    "return () => { loadRunRef.current += 1; };",
  ]) assert.ok(source.includes(token),'account-specific practice guard missing: '+token);
}
await runTests();
console.log('UCAPSA client practice activity: stale session, refresh order, corrupt cache, offline fallback, target days and private modal isolation PASS');
