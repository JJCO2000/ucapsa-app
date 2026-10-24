import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const filename='src/app/admin/customer-profile-edit.tsx';
const source=fs.readFileSync(filename,'utf8');
const parsed=ts.createSourceFile(filename,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Admin profile form TSX parse');
let loadInit,saveDecl;
function scan(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(parsed)==='load')loadInit=node.initializer;
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='save')saveDecl=node;
  ts.forEachChild(node,scan);
}
scan(parsed);
assert.ok(loadInit&&ts.isCallExpression(loadInit)&&ts.isArrowFunction(loadInit.arguments[0]));
assert.ok(saveDecl&&ts.isFunctionDeclaration(saveDecl));
const compiled=ts.transpileModule(
  'exports.makeLoad=()=>('+loadInit.arguments[0].getText(parsed)+');'+
  'exports.makeSave=()=>('+saveDecl.getText(parsed)+');',
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText;
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function harness({userId='A',profile={user_id:'A',full_name:'A original',phone:'111'},loading=false,error='',saving=false}={}){
  const state={profile:null,loadedForUserId:null,loading,error,saving,name:'',email:'',phone:''};
  const loadRunRef={current:0},activeUserIdRef={current:userId};
  const fetches=[],updates=[],notices=[],navigation=[];
  const exports={};
  vm.runInNewContext(compiled,{
    exports,Error,userId,profile,loading,saving,error,activeUserIdRef,loadRunRef,
    name:'Nombre editado',phone:'5535100214',
    getProfileByUserId:()=>{const d=deferred();fetches.push(d);return d.promise;},
    updateAdminCustomerProfile:(id,data)=>{const d=deferred();updates.push({id,data,...d});return d.promise;},
    showStaffDialog:(...args)=>notices.push(args),
    router:{back:()=>navigation.push('back')},
    setStoredProfile:v=>state.profile=v,
    setLoadedForUserId:v=>state.loadedForUserId=v,
    setName:v=>state.name=v,
    setEmail:v=>state.email=v,
    setPhone:v=>state.phone=v,
    setError:v=>state.error=v,
    setLoading:v=>state.loading=v,
    setSaving:v=>state.saving=v,
  });
  return {load:exports.makeLoad(),save:exports.makeSave(),state,fetches,updates,notices,navigation,
    loadRunRef,activeUserIdRef};
}
async function tests(){
  {
    const h=harness();const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.fetches[0].resolve({user_id:'A',full_name:'old',phone:'000'});
    await pending;
    assert.equal(h.state.profile,null,'Old client details must not be shown');
    assert.equal(h.state.loadedForUserId,null);
  }
  {
    const h=harness();const old=h.load(),recent=h.load();
    h.fetches[1].resolve({user_id:'A',full_name:'new',phone:'123'});
    await recent;
    h.fetches[0].resolve({user_id:'A',full_name:'old',phone:'321'});
    await old;
    assert.equal(h.state.profile.full_name,'new');
    assert.equal(h.state.name,'new');
    assert.equal(h.state.loadedForUserId,'A');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const pending=h.load();
    h.fetches[0].resolve({user_id:'other',full_name:'wrong'});
    await pending;
    assert.equal(h.state.profile,null);
    assert.match(h.state.error,/no corresponde/i);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const pending=h.load();
    h.fetches[0].reject(new Error('sin conexión'));
    await pending;
    assert.equal(h.state.profile,null);
    assert.equal(h.state.error,'sin conexión');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness({userId:'B',profile:{user_id:'A',full_name:'Alice'}});
    await h.save();
    assert.equal(h.updates.length,0,'Never write previous client data to new userId');
  }
  {
    const h=harness({loading:true});
    await h.save();
    assert.equal(h.updates.length,0,'Never submit while loading');
  }
  {
    const h=harness();
    const pending=h.save();
    assert.equal(h.updates.length,1);
    assert.equal(h.updates[0].id,'A');
    assert.equal(h.updates[0].data.full_name,'Nombre editado');
    h.activeUserIdRef.current='B';
    h.updates[0].resolve(undefined);
    await pending;
    assert.equal(h.navigation.length,0,'Old write completion may not navigate from new client');
    assert.equal(h.notices.length,0,'Old write completion may not notify on new client');
  }
  {
    const h=harness();
    const pending=h.save();
    h.updates[0].resolve(undefined);
    await pending;
    assert.equal(h.navigation[0],'back');
    assert.equal(h.notices[0][0],'Datos guardados');
    assert.equal(h.state.saving,false);
  }
  for(const token of [
    'const profile = loadedForUserId === userId ? storedProfile : null',
    'activeUserIdRef.current === userId',
    'return () => { loadRunRef.current += 1; }',
    'profile.user_id !== userId',
    'if (activeUserIdRef.current !== userId) return;',
    '!loading && !error && profile',
    'showStaffDialog',
  ])assert.ok(source.includes(token),'Admin client edit isolation contract missing: '+token);
  assert.ok(!source.includes("member={profile?.role === 'member'}"),
    'Do not infer Socio from legacy role in edit header');
}
await tests();
console.log('ADMIN EDIT PROFILE SUBTAB: stale fetch, route switch, wrong user, errors, guarded writes and web dialog PASS');
