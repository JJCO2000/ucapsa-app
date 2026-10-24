import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const screen = fs.readFileSync('src/app/(tabs)/admin-clients.tsx','utf8');
const classification = fs.readFileSync('src/services/admin-directory-classification.domain.ts','utf8');
const parsed = ts.createSourceFile('admin-clients.tsx',screen,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Clients screen TSX must parse');
let loader;
function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'load') loader = node.initializer;
  ts.forEachChild(node,find);
}
find(parsed);
assert.ok(loader && ts.isCallExpression(loader) && ts.isArrowFunction(loader.arguments[0]));
const transpiled = ts.transpileModule('exports.createLoader = () => ('+loader.arguments[0].getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred() {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{resolve,reject,promise};}
function harness() {
  const calls={profiles:[],members:[],followups:[],dogs:[]};
  const state={profiles:[{user_id:'obsolete',role:'member'}],members:['obsolete'],dogs:{old:['Old']},
    followups:{},hasData:true,error:null,loading:false,refreshing:true};
  const loadRunRef={current:0};
  const exports={};
  const make=(type)=>()=>{const d=deferred();calls[type].push(d);return d.promise;};
  vm.runInNewContext(transpiled,{
    exports,Set,Map,isAdmin:true,loadRunRef,
    getAdminClientProfiles:make('profiles'),
    getAdminActiveMembershipUserIds:make('members'),
    getAdminClientFollowupRows:make('followups'),
    getActiveDogNamesByUserIds:make('dogs'),
    withOperationTimeout:p=>p,
    DEFAULT_READ_TIMEOUT_MS:3000,
    friendlyReadError:m=>m,
    setProfiles:v=>state.profiles=v,
    setActiveMemberIds:v=>state.members=[...v],
    setDogNamesByUser:v=>state.dogs=v,
    setFollowupDogNamesByUser:v=>state.followups=v,
    setHasData:v=>state.hasData=v,
    setError:v=>state.error=v,
    setLoading:v=>state.loading=v,
    setRefreshing:v=>state.refreshing=v,
  });
  return {load:exports.createLoader(),calls,state,loadRunRef};
}
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}
async function fulfill(h,i,rows,members,dogs) {
  h.calls.profiles[i].resolve(rows);
  h.calls.members[i].resolve(members);
  h.calls.followups[i].resolve([]);
  await flush();
  assert.ok(h.calls.dogs[i]);
  h.calls.dogs[i].resolve(dogs);
}
async function tests(){
  {
    const h=harness();
    const old=h.load(),current=h.load();
    await fulfill(h,1,[{user_id:'B',role:'client'}],['B'],{B:['Buddy']});
    await current;
    await fulfill(h,0,[{user_id:'A',role:'member'}],[],{A:['No']});
    await old;
    assert.equal(h.state.profiles[0].user_id,'B');
    assert.deepEqual(h.state.members,['B']);
    assert.equal(h.state.dogs.B[0],'Buddy');
    assert.equal(h.state.hasData,true);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();
    const pending=h.load();
    h.loadRunRef.current++;
    await fulfill(h,0,[{user_id:'A',role:'member'}],['A'],{A:['Dog']});
    await pending;
    assert.equal(h.state.profiles[0].user_id,'obsolete');
    assert.equal(h.state.refreshing,true);
  }
  {
    const h=harness();
    const pending=h.load();
    h.calls.profiles[0].reject(new Error('offline'));
    h.calls.members[0].resolve([]);
    h.calls.followups[0].resolve([]);
    await pending;
    assert.equal(h.state.hasData,false);
    assert.equal(h.state.profiles.length,0);
    assert.equal(h.state.members.length,0);
    assert.equal(h.state.error,'No se pudo cargar la lista de clientes.');
    assert.equal(h.state.loading,false);
  }
  const domainExports={};
  const compiled=ts.transpileModule(classification,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  }}).outputText;
  vm.runInNewContext(compiled,{exports:domainExports,module:{exports:domainExports}});
  const active=new Set(['active-client']);
  assert.equal(domainExports.matchesDirectoryFilter(
    {user_id:'former-socio',role:'member'},'members',active),false);
  assert.equal(domainExports.matchesDirectoryFilter(
    {user_id:'active-client',role:'client'},'members',active),true);
  assert.equal(domainExports.directoryStatusLabel(
    {user_id:'former-socio',role:'member'},active),'Cliente');

  for (const token of [
    'getAdminActiveMembershipUserIds()',
    "matchesDirectoryFilter(profile,",
    'directoryStatusLabel(profile, activeMemberIds)',
    'const isSocio = activeMemberIds.has(profile.user_id)',
    'const isCurrentRun = () => loadRunRef.current === runId',
    'return () => { loadRunRef.current += 1; }',
    '!loading && !error && hasData ? <View',
  ]) assert.ok(screen.includes(token),'Missing clients subtab invariant: '+token);
  assert.ok(!screen.includes("profile.role !== 'member'") &&
    !screen.includes("profile.role === 'member'"),
    'Socio may never be inferred from the legacy profile.role on Clients tab');
}
await tests();
console.log('ADMIN CLIENTS SUBTAB: real loader out-of-order, focus guard, error cleanup and membership SSOT PASS');
