import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const screen = fs.readFileSync('src/app/admin/customer-dog-add.tsx', 'utf8');
const section = fs.readFileSync('src/app/admin/customer-section.tsx', 'utf8');
const layout = fs.readFileSync('src/app/admin/_layout.tsx', 'utf8');
const service = fs.readFileSync('src/services/dogs.service.ts', 'utf8');
const parsed = ts.createSourceFile('customer-dog-add.tsx', screen, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length, 0,
  parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let loadFn,saveFn;
function scan(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'load') {
    assert.ok(node.initializer && ts.isCallExpression(node.initializer), 'load callback must be a hook');
    loadFn = node.initializer.arguments[0];
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'saveDog') saveFn = node;
  ts.forEachChild(node,scan);
}
scan(parsed);
assert.ok(loadFn && ts.isArrowFunction(loadFn), 'Real load callback is required');
assert.ok(saveFn, 'Real saveDog function is required');
const compiled = ts.transpileModule(
  'exports.load = (' + loadFn.getText(parsed) + ');\nexports.save = (' + saveFn.getText(parsed) + ');',
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText;
function deferred() {
  let resolve,reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const profile = id=>({user_id:id,role:'client',full_name:'Persona '+id});
const pet = name=>({id:name+'-dog',name});
function harness({userId='A',name='Luna',currentProfile=profile('A'),dogs=[],isAdmin=true,loading=false,saving=false,error=''}={}) {
  const activeUserIdRef={current:userId},loadRunRef={current:0},saveRunRef={current:0},savingRef={current:false};
  const reads=[],dogReads=[],writes=[],dialogs=[],backs=[],warnings=[];
  const state={profile:null,loadedFor:null,dogs:[],name,saving,loading,error,saveError:''};
  const exports={};
  vm.runInNewContext(compiled, {
    exports,Error,userId,isAdmin,activeUserIdRef,loadRunRef,saveRunRef,savingRef,
    profile:currentProfile,name,dogs,loading,saving,error,
    getProfileByUserId:id=>{const d=deferred();reads.push({id,...d});return d.promise;},
    getDogsForUser:id=>{const d=deferred();dogReads.push({id,...d});return d.promise;},
    createDogForUserAdmin:(id,n)=>{const d=deferred();writes.push({id,name:n,...d});return d.promise;},
    setStoredProfile:v=>state.profile=v,
    setLoadedForUserId:v=>state.loadedFor=v,
    setDogs:v=>state.dogs=v,
    setError:v=>state.error=v,
    setLoading:v=>state.loading=v,
    setSaveError:v=>state.saveError=v,
    setSaving:v=>state.saving=v,
    adminCustomerDisplayName:p=>p.full_name,
    showStaffDialog:(...args)=>dialogs.push(args),
    router:{back:()=>backs.push(true)},
    devWarn:(...args)=>warnings.push(args),
  });
  return {load:exports.load,save:exports.save,reads,dogReads,writes,dialogs,backs,warnings,
    state,activeUserIdRef,loadRunRef,saveRunRef,savingRef};
}
async function tests() {
  // Navigating from A to B while the network is pending cannot display A's profile/pets.
  {
    const h=harness(),pending=h.load();
    assert.equal(h.reads[0].id,'A');
    assert.equal(h.dogReads[0].id,'A');
    h.activeUserIdRef.current='B';h.loadRunRef.current+=1;
    h.reads[0].resolve(profile('A'));h.dogReads[0].resolve([pet('Luna')]);
    await pending;
    assert.equal(h.state.profile,null);
    assert.equal(h.state.loadedFor,null);
    assert.equal(h.state.dogs.length,0);
  }
  {
    const h=harness(),old=h.load(),latest=h.load();
    h.reads[1].resolve(profile('A'));h.dogReads[1].resolve([pet('Nueva')]);await latest;
    h.reads[0].resolve(profile('A'));h.dogReads[0].resolve([pet('Vieja')]);await old;
    assert.equal(h.state.profile.user_id,'A');
    assert.equal(h.state.dogs[0].name,'Nueva');
  }
  {
    const h=harness(),pending=h.load();
    h.reads[0].resolve(profile('B'));h.dogReads[0].resolve([]);
    await pending;assert.equal(h.state.profile,null);
    assert.match(h.state.error,/identidad/);
  }
  {
    const h=harness(),pending=h.load();
    h.reads[0].reject(new Error('sin conexión'));h.dogReads[0].resolve([]);
    await pending;assert.equal(h.state.dogs.length,0);
    assert.equal(h.state.error,'sin conexión');
  }
  // Never write for a wrong user or a role without access.
  for (const input of [{currentProfile:profile('B')},{isAdmin:false},{loading:true},{saving:true},{error:'red'}]) {
    const h=harness(input);await h.save();assert.equal(h.writes.length,0);
  }
  for (const input of [
    {name:'   '},{name:'a'.repeat(81)},{name:'Luna',dogs:[pet(' LUNA ')]},
  ]) {
    const h=harness(input);await h.save();
    assert.equal(h.writes.length,0);
    assert.ok(h.state.saveError.length>0,'Invalid/duplicate dog needs visible feedback');
  }
  {
    const h=harness(),pending=h.save();
    assert.equal(h.writes.length,1);
    assert.equal(h.writes[0].id,'A');assert.equal(h.writes[0].name,'Luna');
    const repeated=h.save();await repeated;
    assert.equal(h.writes.length,1,'Double tap cannot add the same dog twice');
    h.writes[0].resolve(pet('Luna'));await pending;
    assert.equal(h.dialogs.length,1);assert.equal(h.backs.length,1);
    assert.equal(h.state.saving,false);
  }
  {
    const h=harness(),pending=h.save();
    h.activeUserIdRef.current='B';h.saveRunRef.current++;
    h.writes[0].resolve(pet('Luna'));await pending;
    assert.equal(h.dialogs.length,0);
    assert.equal(h.backs.length,0);
  }
  {
    const h=harness(),pending=h.save();
    h.writes[0].reject(new Error('Ya existe'));await pending;
    assert.match(h.state.saveError,/Ya existe/);
    assert.equal(h.backs.length,0);
    assert.equal(h.state.saving,false);
  }
  // Contract: existing privileged RPC and SSOT. Adding a dog is NOT a class enrollment.
  assert.ok(service.includes("supabase.rpc('admin_create_basic_dog'"));
  assert.ok(service.includes("p_user_id: cleanUserId"));
  assert.ok(service.includes("p_name: cleanName"));
  assert.ok(!screen.includes('createMyDog('),'Admin must never create in its own account.');
  for (const forbidden of ['updateProgramEnrollment(', 'adminPreregisterDogWithProgram(', 'insert into public.dogs',
      'createMembership(', 'createPayment(']) assert.ok(!screen.includes(forbidden),'Unexpected write in add dog: '+forbidden);
  assert.ok(section.includes('label="Añadir perro"') &&
    section.includes('customer-dog-add?userId=') &&
    section.includes("['client', 'member'].includes(record.profile.role)"),
    'Only eligible account types may see Add dog in profile section.');
  assert.ok(layout.includes('name="customer-dog-add"'));
  assert.ok(screen.includes('profile && !loading && !error'),
    'Do not show form before owner account is verified.');
  console.log('ADMIN ADD DOG: real load/save, stale identity, duplicate, invalid name, failure, double tap, role and RPC routing PASS');
}
await tests();
