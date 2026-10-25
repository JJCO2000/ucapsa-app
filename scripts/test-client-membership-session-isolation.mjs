import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file='src/app/client/membership.tsx';
const source=fs.readFileSync(file,'utf8');
const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let initializer;
function walk(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(parsed)==='load')initializer=node.initializer;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(initializer&&ts.isCallExpression(initializer));
const callback=initializer.arguments[0];
assert.ok(callback&&ts.isArrowFunction(callback));
const compiled=ts.transpileModule('exports.makeLoad = () => ('+callback.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(userId='A'){
  const state={membership:null,programs:[],cachedMembership:null,savedAt:null,
    error:null,usingSavedData:false,membershipDataAvailable:false,membershipFresh:false,
    eligibility:null,eligibilityFresh:false,eligibilityChecking:true,loading:true,
    loadedForUserId:null};
  const loadRunRef={current:0},activeUserIdRef={current:userId};
  const cache=[],rpc=[],writes=[],warns=[];
  const setters={
    setMembership:v=>state.membership=v,
    setPrograms:v=>state.programs=v,
    setCachedMembership:v=>state.cachedMembership=v,
    setSavedAt:v=>state.savedAt=typeof v==='function'?v(state.savedAt):v,
    setError:v=>state.error=v,
    setUsingSavedData:v=>state.usingSavedData=v,
    setMembershipDataAvailable:v=>state.membershipDataAvailable=v,
    setMembershipFresh:v=>state.membershipFresh=v,
    setEligibility:v=>state.eligibility=v,
    setEligibilityFresh:v=>state.eligibilityFresh=v,
    setEligibilityChecking:v=>state.eligibilityChecking=v,
    setLoading:v=>state.loading=v,
    setLoadedForUserId:v=>state.loadedForUserId=v,
  };
  const exports={};
  const defer=(list,kind)=>{const d=deferred();list.push({kind,...d});return d.promise;};
  vm.runInNewContext(compiled,{
    Error,exports,userId,isAdmin:false,loadRunRef,activeUserIdRef,
    ...setters,
    clientReadKeys:{membership:'membership',programs:'programs'},
    readClientResource:(id,key)=>defer(cache,key),
    getMyMembership:()=>defer(rpc,'membership'),
    getMyProgramEnrollments:()=>defer(rpc,'programs'),
    getMyMembershipEligibility:()=>defer(rpc,'eligibility'),
    withOperationTimeout:p=>p,DEFAULT_READ_TIMEOUT_MS:1000,
    createMembershipOfflineSummary:row=>({status:row?.status??'none',start_date:null,end_date:null}),
    sanitizeProgramRowsForCache:rows=>rows,
    writeClientResource:(id,key,value)=>{
      const d=deferred();writes.push({id,key,value,...d});return d.promise;
    },
    friendlyReadError:s=>s,devWarn:(...args)=>warns.push(args),
  });
  return {load:exports.makeLoad(),state,loadRunRef,activeUserIdRef,cache,rpc,writes,warns};
}
function resolveCache(h,index,member=null,program=null){
  h.cache[index].resolve(member);
  h.cache[index+1].resolve(program);
}
function resolveRemote(h,index,membership={status:'active'},programs=[],eligibility={eligible:true}){
  h.rpc[index].resolve(membership);
  h.rpc[index+1].resolve(programs);
  h.rpc[index+2].resolve(eligibility);
}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
async function run(){
  // A's cached private membership is never reused in B's session.
  {
    const h=harness();const load=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    resolveCache(h,0,{data:{status:'active'},saved_at:'A-day'},null);await load;
    assert.equal(h.state.cachedMembership,null);
    assert.equal(h.state.membership,null);
    assert.equal(h.state.loadedForUserId,'A');
    assert.equal(h.rpc.length,0);
  }
  // Concurrent refresh: only the later result may be displayed.
  {
    const h=harness();const first=h.load(),second=h.load();
    resolveCache(h,2,null,null);await flush();
    assert.equal(h.rpc.length,3);
    resolveRemote(h,0,null,[],{eligible:false});await flush();
    assert.equal(h.writes.length,1);
    h.writes[0].resolve({saved_at:'recent'});
    await second;
    resolveCache(h,0,{data:{status:'active'},saved_at:'old'},null);
    await first;
    assert.equal(h.state.membership,null);
    assert.equal(h.state.membershipFresh,true);
    assert.equal(h.state.eligibility.eligible,false);
    assert.equal(h.state.loadedForUserId,'A');
    assert.equal(h.rpc.length,3,'older cache must not start remote RPC');
  }
  // Membership remote fails: do not show old QR, use cache with clear offline state.
  {
    const h=harness();const load=h.load();
    resolveCache(h,0,{data:{status:'active',end_date:'2026-12-31'},saved_at:'cached-day'},null);
    await flush();
    h.rpc[0].reject(new Error('offline'));
    h.rpc[1].resolve([]);
    h.rpc[2].reject(new Error('offline'));await load;
    assert.equal(h.state.membership,null,'No verified membership QR should survive a failed read');
    assert.equal(h.state.cachedMembership.status,'active');
    assert.equal(h.state.membershipFresh,false);
    assert.equal(h.state.usingSavedData,true);
    assert.equal(h.state.loading,false);
  }
  // Cache read may fail without blocking the canonical server.
  {
    const h=harness();const load=h.load();
    h.cache[0].reject(new Error('local cache failed'));h.cache[1].resolve(null);
    await flush();assert.equal(h.rpc.length,3);
    resolveRemote(h,0,null,[],{eligible:false});await flush();
    assert.equal(h.writes.length,1);
    h.writes[0].resolve({saved_at:'today'});await load;
    assert.equal(h.state.error,null);
    assert.equal(h.warns.length,1);
  }
  // Switch account while a successful RPC waits to persist its offline snapshot.
  {
    const h=harness();const load=h.load();
    resolveCache(h,0,null,null);await flush();
    resolveRemote(h,0,{status:'active'},[{enrollment:{id:'A-private'}}],{eligible:true});
    await flush();assert.equal(h.writes.length,1);
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.writes[0].resolve({saved_at:'late-A'});await load;
    assert.equal(h.state.savedAt,null);
    assert.equal(h.state.programs.length,0);
    assert.equal(h.state.eligibility,null);
    assert.equal(h.writes.length,1,'stale response cannot write any more user data');
  }
  for(const token of [
    'const currentAccount = Boolean(userId && loadedForUserId === userId)',
    'const membership = currentAccount ? storedMembership : null',
    'const cachedMembership = currentAccount ? storedCachedMembership : null',
    'const programs = currentAccount ? storedPrograms : []',
    'loadRunRef.current === runId && activeUserIdRef.current === userId',
    'if (!isCurrentRun()) return;',
    'return () => { loadRunRef.current += 1; }',
    'if (activeUserIdRef.current !== userId) return;',
    'if (activeUserIdRef.current === userId) setSaving(false);',
  ])assert.ok(source.includes(token),'Account isolation guard missing: '+token);
}
await run();
console.log('UCAPSA membership session isolation: stale cache, parallel loads, QR redaction, offline fallback, cache error, cross-user write guard PASS');
