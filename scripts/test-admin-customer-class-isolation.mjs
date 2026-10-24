import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/admin/customer-class.tsx','utf8');
const ast=ts.createSourceFile('customer-class.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,'Class editor TSX must parse');
let loadNode,saveNode;
function walk(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='load'){
    assert.ok(ts.isCallExpression(node.initializer));
    loadNode=node.initializer.arguments[0];
  }
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='save')saveNode=node;
  ts.forEachChild(node,walk);
}
walk(ast);
assert.ok(loadNode && ts.isArrowFunction(loadNode),'Real useCallback load must exist');
assert.ok(saveNode,'Real class save function must exist');
const js=ts.transpileModule(
  'exports.load=('+loadNode.getText(ast)+');\nexports.makeSave=()=>('+saveNode.getText(ast)+');',
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText;
function deferred(){
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function record(id='A',enrollment='en1'){
  return {profile:{user_id:id},enrollments:[{
    enrollment:{id:enrollment,user_id:id,schedule_id:'sched1',program_level:'base',
      dog_id:'dog1',dog_name:'Moka',physical_card_number:null,notes:''},
    program:{id:'program1',code:'puppy'},
  }]};
}
function makeHarness({userId='A',enrollmentId='en1',storedRow=null}={}){
  const recordKey=userId+':'+enrollmentId;
  const activeRecordKeyRef={current:recordKey},loadRunRef={current:0},saveRunRef={current:0};
  const pending=[],writes=[],creates=[],dialogs=[];
  const state={record:null,loadedFor:null,schedules:[],dogs:[],loading:false,
    saving:false,error:'',editing:true};
  const exports={};
  const selectedRow=storedRow??record(userId,enrollmentId).enrollments[0];
  vm.runInNewContext(js,{
    exports,Error,userId,enrollmentId,recordKey,activeRecordKeyRef,loadRunRef,saveRunRef,
    row:selectedRow,loading:false,saving:false,error:'',scheduleId:'sched1',
    programSchedules:[{id:'sched1'}],dogMode:'existing',dogId:'dog1',
    dogs:[{id:'dog1',name:'Moka'}],dogName:'Moka',
    cardNumber:'',level:'base',notes:'',
    getAdminCustomerRecord:(id)=>{const d=deferred();pending.push({type:'record',id,...d});return d.promise;},
    getProgramSchedules:()=>{const d=deferred();pending.push({type:'schedule',...d});return d.promise;},
    getDogsForUser:(id)=>{const d=deferred();pending.push({type:'dogs',id,...d});return d.promise;},
    createDogForUserAdmin:(id,name)=>{creates.push({id,name});return Promise.resolve({id:'newDog',name});},
    updateProgramEnrollment:(id,input)=>{const d=deferred();writes.push({id,input,...d});return d.promise;},
    setStoredRecord:v=>state.record=v,
    setLoadedForKey:v=>state.loadedFor=v,
    setSchedules:v=>state.schedules=v,
    setDogs:v=>state.dogs=v,
    setScheduleId:()=>{},setLevel:()=>{},setDogMode:()=>{},setDogId:()=>{},
    setDogName:()=>{},setCardNumber:()=>{},setNotes:()=>{},
    setError:v=>state.error=v,setLoading:v=>state.loading=v,
    setSaving:v=>state.saving=v,setEditing:v=>state.editing=v,
    devWarn:()=>{},showStaffDialog:(...args)=>dialogs.push(args),
    load:async()=>{},
  });
  return {load:exports.load,save:exports.makeSave(),pending,writes,creates,dialogs,
    state,activeRecordKeyRef,loadRunRef,saveRunRef,recordKey};
}
function resolveLoad(h,start,data=record(),schedules=[{id:'sched1'}],dogs=[{id:'dog1',name:'Moka'}]){
  const calls=h.pending.slice(start,start+3);
  assert.deepEqual(calls.map(c=>c.type),['record','schedule','dogs']);
  calls[0].resolve(data);calls[1].resolve(schedules);calls[2].resolve(dogs);
}
async function run(){
  {
    const h=makeHarness();const p=h.load();h.activeRecordKeyRef.current='B:en2';
    h.loadRunRef.current++;
    resolveLoad(h,0);await p;
    assert.equal(h.state.record,null,'stale client must not be committed');
    assert.equal(h.state.loadedFor,null);
  }
  {
    const h=makeHarness();const a=h.load(),b=h.load();
    resolveLoad(h,3);await b;
    resolveLoad(h,0,record('B','en2'));await a;
    assert.equal(h.state.record.profile.user_id,'A');
    assert.equal(h.state.loadedFor,'A:en1');
  }
  {
    const h=makeHarness();const p=h.load();
    resolveLoad(h,0,record('B','en1'));await p;
    assert.equal(h.state.record,null);
    assert.match(h.state.error,/verificar/);
    assert.equal(h.state.loading,false);
  }
  {
    const h=makeHarness();const p=h.load();
    resolveLoad(h,0,record('A','wrong-enrollment'));await p;
    assert.equal(h.state.record,null,'Wrong enrollment must not fall back to first');
    assert.match(h.state.error,/verificar/);
  }
  {
    const h=makeHarness();const p=h.load();
    h.pending[0].reject(new Error('offline'));h.pending[1].resolve([]);h.pending[2].resolve([]);
    await p;assert.equal(h.state.record,null);assert.equal(h.state.error,'offline');
  }
  {
    const h=makeHarness({storedRow:record('B','en1').enrollments[0]});
    await h.save();assert.equal(h.writes.length,0,'Wrong client must never write');
  }
  {
    const h=makeHarness();const p=h.save();
    assert.equal(h.writes.length,1);assert.equal(h.writes[0].id,'en1');
    h.activeRecordKeyRef.current='B:en2';h.saveRunRef.current++;
    h.writes[0].resolve({});await p;
    assert.equal(h.dialogs.length,0,'Old class save must not alert another client');
    assert.equal(h.state.editing,true);
  }
  for(const term of [
    'loadedForKey === recordKey',
    'nextRecord.profile.user_id !== userId',
    'selected.enrollment.user_id !== userId',
    "enrollmentId && !selected",
    "activeRecordKeyRef.current === recordKey",
    'return () => { loadRunRef.current += 1; saveRunRef.current += 1; };',
    "row.enrollment.user_id !== userId || loading || saving || error",
    'if (!isCurrentSave()) return;',
    'activeRecordKeyRef.current !== boundRecordKey',
    'row && !loading && !error',
  ])assert.ok(source.includes(term),'Missing verified class isolation guard: '+term);
  console.log('ADMIN CLIENT CLASS: real load/save callbacks, cross-user loads, wrong enrollment, stale writes and failures PASS');
}
await run();
