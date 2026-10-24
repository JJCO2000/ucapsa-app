import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/admin/customer-profile-edit.tsx','utf8');
const ast=ts.createSourceFile('customer-profile-edit.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,
  ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let loadCallback,saveFn;
function scan(node){
  if(ts.isVariableDeclaration(node) && node.name.getText(ast)==='load'){
    assert.ok(node.initializer && ts.isCallExpression(node.initializer));
    loadCallback=node.initializer.arguments[0];
  }
  if(ts.isFunctionDeclaration(node) && node.name?.text==='save') saveFn=node;
  ts.forEachChild(node,scan);
}
scan(ast);
assert.ok(loadCallback && ts.isArrowFunction(loadCallback),'Real load callback missing');
assert.ok(saveFn,'Real save function missing');
const code=ts.transpileModule(
  'exports.makeLoad=()=>('+loadCallback.getText(ast)+');\n'
  +'exports.makeSave=()=>('+saveFn.getText(ast)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness({userId='A',profile=null,loading=false,saving=false,error=''}={}){
  const activeUserIdRef={current:userId},loadRunRef={current:0},saveRunRef={current:0};
  const reads=[],writes=[],alerts=[],backs=[];
  const state={storedProfile:null,loadedForUserId:null,name:'',email:'',phone:'',
    loading,saving,error,saveError:''};
  const exports={};
  vm.runInNewContext(code,{
    exports,Error,userId,profile,name:'Nombre actualizado',phone:'5535100214',
    loading,saving,error,activeUserIdRef,loadRunRef,saveRunRef,
    Platform:{OS:'web'},Alert:{alert:(...args)=>alerts.push(args)},
    router:{back:()=>backs.push('back')},
    getProfileByUserId:()=>{const d=deferred();reads.push(d);return d.promise;},
    updateAdminCustomerProfile:(id,payload)=>{const d=deferred();writes.push({id,payload,...d});return d.promise;},
    setStoredProfile:v=>state.storedProfile=v,
    setLoadedForUserId:v=>state.loadedForUserId=v,
    setName:v=>state.name=v,
    setEmail:v=>state.email=v,
    setPhone:v=>state.phone=v,
    setError:v=>state.error=v,
    setSaveError:v=>state.saveError=v,
    setLoading:v=>state.loading=v,
    setSaving:v=>state.saving=v,
  });
  return {load:exports.makeLoad(),save:exports.makeSave(),state,reads,writes,alerts,backs,
    activeUserIdRef,loadRunRef,saveRunRef};
}
const profile=id=>({user_id:id,full_name:'Persona '+id,email:id+'@example.invalid',phone:'5512345678'});
async function run(){
  {
    const h=harness();const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current+=1;
    h.reads[0].resolve(profile('A'));await pending;
    assert.equal(h.state.storedProfile,null);
    assert.equal(h.state.loadedForUserId,null);
  }
  {
    const h=harness();const old=h.load(),recent=h.load();
    h.reads[1].resolve(profile('A'));await recent;
    h.reads[0].resolve(profile('OLD'));await old;
    assert.equal(h.state.storedProfile.user_id,'A');
    assert.equal(h.state.loadedForUserId,'A');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const pending=h.load();
    h.reads[0].resolve(profile('B'));await pending;
    assert.equal(h.state.storedProfile,null);
    assert.match(h.state.error,/verificar/);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const pending=h.load();
    h.reads[0].reject(new Error('red no disponible'));await pending;
    assert.equal(h.state.storedProfile,null);
    assert.equal(h.state.error,'red no disponible');
  }
  {
    const h=harness({profile:profile('B')});
    await h.save();
    assert.equal(h.writes.length,0,'Never save stale profile with current userId');
  }
  {
    const h=harness({profile:profile('A')});
    const pending=h.save();
    assert.equal(h.writes.length,1);
    assert.equal(h.writes[0].id,'A');
    assert.equal(h.writes[0].payload.full_name,'Nombre actualizado');
    assert.equal(h.writes[0].payload.phone,'5535100214');
    h.activeUserIdRef.current='B';h.saveRunRef.current+=1;
    h.writes[0].resolve(profile('A'));await pending;
    assert.equal(h.backs.length,0,'Old save must not navigate from a new customer');
  }
  {
    const h=harness({profile:profile('A')});
    const pending=h.save();
    h.writes[0].reject(new Error('sin permisos'));await pending;
    assert.match(h.state.saveError,/sin permisos/,'Web errors must be visible');
    assert.equal(h.backs.length,0);
    assert.equal(h.state.saving,false);
  }
  {
    const h=harness({profile:profile('A')});
    const pending=h.save();h.writes[0].resolve(profile('A'));await pending;
    assert.equal(h.backs.length,1);
    assert.equal(h.state.saving,false);
  }
  for(const text of [
    'const profile = loadedForUserId === userId ? storedProfile : null',
    'profile.user_id !== userId || loading || saving || error',
    'activeUserIdRef.current === boundUserId',
    'saveRunRef.current === saveRunId',
    'row.user_id !== userId',
    'return () => { loadRunRef.current += 1; saveRunRef.current += 1; }',
    'profile && !loading && !error',
    'saveError ? <Text accessibilityRole="alert"',
  ])assert.ok(source.includes(text),'Admin editor guard missing: '+text);
  console.log('UCAPSA Admin Datos/Editar: stale client, concurrent loads, failed read, mismatch, safe writes and web error feedback PASS');
}
await run();
