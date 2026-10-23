import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = 'src/app/client/dog-profile.tsx';
const source=fs.readFileSync(path,'utf8');
const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Dog profile TSX syntax must remain valid');
let initializer;
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') initializer=node.initializer;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(initializer && ts.isCallExpression(initializer),'Real dog-profile load must be a useCallback');
const callback=initializer.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback),'Real load callback must be an arrow');
const js=ts.transpileModule('exports.makeLoad = () => ('+callback.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function deferred(){
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
function harness(){
  const state={profile:null,loadedKey:null,draft:null,photoUrl:'old-photo',loading:false,
    error:false,avatarKey:null,avatarColor:null,cameraOpen:true,avatarError:null};
  const loadRunRef={current:0},activeProfileKeyRef={current:'user-A:dog-A'};
  const desiredAvatar={current:{key:'old',color:'old'}};
  const persistedAvatar={current:{key:'old',color:'old'}};
  const profiles=[],photos=[];
  const ctx={
    Error,user:{id:'user-A'},dogId:'dog-A',isAdmin:false,profileKey:'user-A:dog-A',
    loadRunRef,activeProfileKeyRef,desiredAvatar,persistedAvatar,
    EMPTY_DRAFT:{name:''},
    setLoading:v=>state.loading=v,
    setLoadError:v=>state.error=v,
    setProfile:v=>state.profile=v,
    setLoadedProfileKey:v=>state.loadedKey=v,
    setDraft:v=>state.draft=v,
    setPhotoUrl:v=>state.photoUrl=v,
    setAvatarKey:v=>state.avatarKey=v,
    setAvatarColor:v=>state.avatarColor=v,
    setAvatarError:v=>state.avatarError=v,
    setCameraOpen:v=>state.cameraOpen=v,
    draftFromProfile:v=>({name:v.name}),
    DEFAULT_READ_TIMEOUT_MS:5000,
    withOperationTimeout:p=>p,
    getMyDogProfile:()=>{const d=deferred();profiles.push(d);return d.promise;},
    getPrivateDogPhotoUrl:()=>{const d=deferred();photos.push(d);return d.promise;},
  };
  const exports={};
  vm.runInNewContext(js,{exports,...ctx});
  return {load:exports.makeLoad(),state,loadRunRef,activeProfileKeyRef,profiles,photos,desiredAvatar,persistedAvatar};
}
const dog=(name='Dog A')=>({name,avatar_key:'dog',avatar_color:'green',photo_path:'private-photo'});
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}
{
  const h=harness();const p=h.load();
  assert.equal(h.state.profile,null,'A new load clears the previous dog');
  assert.equal(h.state.photoUrl,null,'Signed photo URL must be cleared');
  assert.equal(h.state.cameraOpen,false,'Camera must close on identity changes');
  h.activeProfileKeyRef.current='user-A:dog-B';h.loadRunRef.current++;
  h.profiles[0].resolve(dog());
  await p;
  assert.equal(h.state.profile,null,'Stale fetch must not expose private dog data');
  assert.equal(h.photos.length,0,'Stale dog must not request a signed private photo');
}
{
  const h=harness();const p=h.load();
  h.profiles[0].resolve(dog());await flush();
  assert.equal(h.photos.length,1);
  h.activeProfileKeyRef.current='user-B:dog-A';h.loadRunRef.current++;
  h.photos[0].resolve('private-signed-photo-of-A');await p;
  assert.equal(h.state.profile,null);
  assert.equal(h.state.photoUrl,null,'Signed photo URL from prior user must not appear');
}
{
  const h=harness();const older=h.load(),latest=h.load();
  h.profiles[1].resolve(dog('Latest'));await flush();
  h.photos[0].resolve('latest-signed-photo');await latest;
  h.profiles[0].resolve(dog('Older'));await older;
  assert.equal(h.state.profile.name,'Latest');
  assert.equal(h.state.loadedKey,'user-A:dog-A');
  assert.equal(h.state.photoUrl,'latest-signed-photo');
  assert.equal(h.state.loading,false);
  assert.equal(h.state.avatarKey,'dog');
}
{
  const h=harness();const p=h.load();
  h.profiles[0].reject(new Error('Offline'));await p;
  assert.equal(h.state.error,true);
  assert.equal(h.state.loading,false);
  assert.equal(h.state.profile,null);
}
for (const token of [
  'const profile = loadedProfileKey === profileKey ? storedProfile : null',
  'activeProfileKeyRef.current === requestedKey',
  'runId === loadRunRef.current',
  'setLoadedProfileKey(requestedKey)',
  'setLoadedProfileKey(null)',
  'return () => { loadRunRef.current += 1; }',
  'loading || (!profile && !loadError)',
  'if (activeProfileKeyRef.current !== requestedKey) return;',
  'if (!dogId || !user || !profile || isAdmin) return;',
  'setCameraOpen(false)',
]) assert.ok(source.includes(token),'Profile/photo/session safety contract missing: '+token);
assert.ok((source.match(/if \(activeProfileKeyRef\.current !== requestedKey\) return;/g)||[]).length>=7,
  'Old avatar, photo, camera and profile mutations must not replace a newly opened dog');
console.log('UCAPSA client dog profile identity + signed photo + late mutation UI guards PASS');
