import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/(tabs)/dog.tsx','utf8');
const parsed=ts.createSourceFile('dog.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
const declarations=new Map();
let saveDecl;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    declarations.set(node.name.text,node.initializer.getText(parsed));
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text==='saveDog') saveDecl=node;
  ts.forEachChild(node,visit);
}
visit(parsed);
function compile(code) {
  return ts.transpileModule(code,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  }}).outputText;
}
const sensitive=['dogs','rows','practiceSnapshot','dogAchievements','photoUrls','localReady'];
const expression='const scopeReady='+declarations.get('scopeReady')+';\n'
  + sensitive.map(name=>'const '+name+'='+declarations.get(name)+';').join('\n')
  + '\nexports.result={scopeReady,'+sensitive.join(',')+'};';
function readView({userId,loadedForUserId,admin=false}) {
  const exports={};
  vm.runInNewContext(compile(expression),{
    exports,Boolean,user:userId?{id:userId}:null,isAdmin:admin,loadedForUserId,
    storedDogs:[{id:'A-private'}],storedRows:[{id:'A-enrollment'}],
    storedPracticeSnapshot:{entries:[{id:'A-practice'}]},
    storedDogAchievements:[{id:'A-medal'}],storedPhotoUrls:{'A-private':'private-url'},
    storedLocalReady:true,
  });
  return JSON.parse(JSON.stringify(exports.result));
}
{
  const v=readView({userId:'B',loadedForUserId:'A'});
  assert.equal(v.scopeReady,false);
  assert.deepEqual(v.dogs,[]);
  assert.deepEqual(v.rows,[]);
  assert.equal(v.practiceSnapshot,null);
  assert.deepEqual(v.dogAchievements,[]);
  assert.deepEqual(v.photoUrls,{});
  assert.equal(v.localReady,false);
}
{
  const v=readView({userId:'A',loadedForUserId:'A'});
  assert.equal(v.scopeReady,true);
  assert.equal(v.dogs[0].id,'A-private');
  assert.equal(v.rows[0].id,'A-enrollment');
  assert.equal(v.photoUrls['A-private'],'private-url');
}
{
  assert.equal(readView({userId:null,loadedForUserId:'A'}).scopeReady,false);
  assert.equal(readView({userId:'A',loadedForUserId:'A',admin:true}).scopeReady,false);
}
for (const token of [
  'activeUserIdRef.current === (user?.id ?? null)',
  'setLoadedForUserId(null)',
  'setLoadedForUserId(user.id)',
  'setEditorMode(null)',
  'if (activeUserIdRef.current !== userId || cacheScopeRef.current !== userId) return;',
]) assert.ok(source.includes(token),'Dog tab lost session isolation token: '+token);

assert.ok(saveDecl,'Real saveDog implementation not found');
const compiled=compile(saveDecl.getText(parsed)+'\nexports.saveDog=saveDog;');
function deferred(){
  let resolve, reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function saveHarness(){
  const write=deferred(),created=deferred();
  const current={activeUserIdRef:{current:'A'},cacheScopeRef:{current:'A'}};
  const state={dogs:null,saving:false,modal:null,draft:null,selected:null,writes:0,alerts:[]};
  const exports={};
  vm.runInNewContext(compiled,{
    exports,Error,
    user:{id:'A'},scopeReady:true,draftName:'Bongo',dogs:[],
    ...current,
    setSaving:v=>state.saving=v,
    setDogs:v=>state.dogs=v,
    setEditorMode:v=>state.modal=v,
    setDraftName:v=>state.draft=v,
    setSelectedDogId:v=>state.selected=v,
    createMyDog:()=>created.promise,
    writeClientResource:()=>{state.writes++;return write.promise;},
    clientReadKeys:{dogs:'dogs'},
    load:()=>{},
    Alert:{alert:(...args)=>state.alerts.push(args)},
    friendlyWriteError:e=>String(e),
  });
  return {save:exports.saveDog,state,created,write,...current};
}
{
  const h=saveHarness();
  const pending=h.save();
  h.activeUserIdRef.current='B';
  h.created.resolve({id:'new-A',name:'Bongo'});
  await pending;
  assert.equal(h.state.dogs,null,'Old session response cannot paint another user dog');
  assert.equal(h.state.writes,0,'Old session result cannot trigger subsequent cache writes');
  assert.equal(h.state.alerts.length,0);
}
{
  const h=saveHarness();
  const pending=h.save();
  h.created.resolve({id:'new-A',name:'Bongo'});
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(h.state.writes,1);
  h.activeUserIdRef.current='B';
  h.write.resolve({saved_at:'now'});
  await pending;
  assert.equal(h.state.selected,null,'Post-write continuation cannot switch another account selected dog');
  assert.equal(h.state.modal,null);
  assert.equal(h.state.alerts.length,0);
}
console.log('UCAPSA Dog tab account isolation: render, private photos and achievements, delayed saves and account-switch responses PASS');
