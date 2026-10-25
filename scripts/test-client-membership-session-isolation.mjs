import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/client/membership.tsx', 'utf8');
const parsed = ts.createSourceFile('membership.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
let initializer;
function walk(node) {
  if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') initializer=node.initializer;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Cannot locate real screen load callback');
const arrow=initializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow),'Expected actual React useCallback arrow');
const js=ts.transpileModule('exports.makeLoad = () => ('+arrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness() {
  const userId='A',isAdmin=false;
  const activeUserIdRef={current:userId},loadRunRef={current:0};
  const state={loadedForUserId:null,membership:null,programs:[],cachedMembership:null,
    savedAt:null,error:null,usingSavedData:false,membershipDataAvailable:false,
    membershipFresh:false,eligibility:null,eligibilityFresh:false,eligibilityChecking:true,
    loading:true};
  const reads=[],remotes=[],writes=[],warnings=[];
  const setters={
    setLoadedForUserId:'loadedForUserId',setMembership:'membership',setPrograms:'programs',
    setCachedMembership:'cachedMembership',setSavedAt:'savedAt',setError:'error',
    setUsingSavedData:'usingSavedData',setMembershipDataAvailable:'membershipDataAvailable',
    setMembershipFresh:'membershipFresh',setEligibility:'eligibility',
    setEligibilityFresh:'eligibilityFresh',setEligibilityChecking:'eligibilityChecking',
    setLoading:'loading',
  };
  const context={exports:{},Error,userId,isAdmin,activeUserIdRef,loadRunRef,
    clientReadKeys:{membership:'membership',programs:'programs'},
    readClientResource:(id,key)=>{const x=deferred();reads.push({id,key,...x});return x.promise;},
    getMyMembership:()=>{const x=deferred();remotes.push({kind:'membership',...x});return x.promise;},
    getMyProgramEnrollments:()=>{const x=deferred();remotes.push({kind:'programs',...x});return x.promise;},
    getMyMembershipEligibility:()=>{const x=deferred();remotes.push({kind:'eligibility',...x});return x.promise;},
    withOperationTimeout:x=>x,DEFAULT_READ_TIMEOUT_MS:3000,
    writeClientResource:(id,key,value)=>{const x=deferred();writes.push({id,key,value,...x});return x.promise;},
    createMembershipOfflineSummary:row=>({status:row.status,member_number:row.member_number}),
    sanitizeProgramRowsForCache:x=>x,
    friendlyReadError:x=>x,
    devWarn:(...args)=>warnings.push(args),
  };
  for(const [setter,name] of Object.entries(setters)) context[setter]=(next)=>{
    state[name]=typeof next==='function'?next(state[name]):next;
  };
  vm.runInNewContext(js,context);
  return {load:context.exports.makeLoad(),state,reads,remotes,writes,warnings,activeUserIdRef,loadRunRef};
}
async function tick(){for(let i=0;i<5;i++)await Promise.resolve();}
function settleReads(h,membership=null,programs=null){for(const read of h.reads){
  read.resolve(read.key==='membership'?membership:programs);
}}
function settleRemote(h,member={status:'active',member_number:'N123'},programs=[],eligible=true){
  for(const r of h.remotes){
    if(r.kind==='membership')r.resolve(member);
    if(r.kind==='programs')r.resolve(programs);
    if(r.kind==='eligibility')r.resolve({eligible});
  }
}
async function test() {
  {
    const h=harness();
    const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    settleReads(h,{data:{status:'active',member_number:'A-secret'},saved_at:'old'});
    await pending;
    assert.equal(h.state.membership,null);
    assert.equal(h.state.cachedMembership,null);
    assert.equal(h.remotes.length,0);
  }
  {
    const h=harness();
    const previous=h.load(),current=h.load();
    h.reads[2].resolve(null);h.reads[3].resolve(null);await tick();
    assert.equal(h.remotes.length,3);
    settleRemote(h,{status:'active',member_number:'latest'});
    await tick();
    assert.equal(h.writes.length,1);
    h.writes[0].resolve({saved_at:'today'});await tick();
    assert.equal(h.writes.length,2);
    h.writes[1].resolve({saved_at:'today'});await current;
    h.reads[0].resolve({data:{member_number:'stale'},saved_at:'old'});h.reads[1].resolve(null);
    await previous;
    assert.equal(h.state.membership.member_number,'latest');
    assert.equal(h.state.cachedMembership.member_number,'latest');
    assert.equal(h.state.membershipFresh,true);
    assert.equal(h.state.eligibilityFresh,true);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const p=h.load();
    h.reads[0].reject(new Error('cache unavailable'));h.reads[1].resolve(null);
    await tick();assert.equal(h.remotes.length,3);
    settleRemote(h,{status:'active',member_number:'remote'});
    await tick();h.writes[0].reject(new Error('disk full'));
    await tick();h.writes[1].reject(new Error('disk full'));
    await p;
    assert.equal(h.state.membership.member_number,'remote');
    assert.equal(h.state.membershipFresh,true);
    assert.equal(h.state.eligibilityFresh,true);
    assert.equal(h.state.error,null);
    assert.equal(h.state.loading,false);
    assert.ok(h.warnings.length>=2,'Failed optional cache must be observed');
  }
  {
    const h=harness();const p=h.load();
    settleReads(h,{data:{status:'active',member_number:'offline'},saved_at:'yesterday'});
    await tick();
    assert.equal(h.state.cachedMembership.member_number,'offline');
    for(const q of h.remotes)q.reject(new Error('offline'));
    await p;
    assert.equal(h.state.membership,null);
    assert.equal(h.state.usingSavedData,true);
    assert.equal(h.state.membershipFresh,false);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const p=h.load();settleReads(h);await tick();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    settleRemote(h,{status:'active',member_number:'never'});
    await p;assert.equal(h.state.membership,null);
    assert.equal(h.writes.length,0);
  }
  for(const invariant of [
    'const belongsToUser = Boolean(userId) && loadedForUserId === userId;',
    'const membership = belongsToUser ? storedMembership : null;',
    'const cachedMembership = belongsToUser ? storedCachedMembership : null;',
    'const eligibility = belongsToUser ? storedEligibility : null;',
    'const loading = !belongsToUser || storedLoading;',
    'activeUserIdRef.current === userId',
    'return () => { loadRunRef.current += 1; };',
    'if (activeUserIdRef.current !== userId) return;',
    "Alert.alert('Sesión requerida', 'Vuelve a iniciar sesión para enviar la solicitud.')",
    'if (isAdmin || !belongsToUser || saving || !membershipFresh',
  ])assert.ok(source.includes(invariant),'Lost account isolation invariant: '+invariant);
}
await test();
console.log('UCAPSA membership isolation: account switch, concurrency, cache failures, offline fallback, eligibility and mutation checks PASS');
