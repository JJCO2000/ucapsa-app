import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/admin/customer-attendance.tsx','utf8');
const ast=ts.createSourceFile('customer-attendance.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
let loadArrow,saveFunction;
function scan(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='load'){
    assert.ok(ts.isCallExpression(node.initializer));
    loadArrow=node.initializer.arguments[0];
  }
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='saveAttendance')saveFunction=node;
  ts.forEachChild(node,scan);
}
scan(ast);
assert.ok(loadArrow&&ts.isArrowFunction(loadArrow),'Real loader callback missing');
assert.ok(saveFunction,'Real saveAttendance missing');
const compiled=ts.transpileModule('exports.makeLoad=()=>('+loadArrow.getText(ast)+');\n'
  +'exports.makeSave=()=>('+saveFunction.getText(ast)+');',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
function deferred(){
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function record(id='A',enrollmentId='en1'){
  return {profile:{user_id:id},enrollments:[{enrollment:{id:enrollmentId,user_id:id},
    attendances:[{id:'att1',session_id:'session1'}]}]};
}
function harness({userId='A',initialEnrollmentId='en1',editEnrollment=null,blocked=false}={}){
  const recordKey=userId+':'+initialEnrollmentId;
  const activeRecordKeyRef={current:recordKey},loadRunRef={current:0},saveRunRef={current:0};
  const reads=[],timelines=[],sessions=[],mutations=[],dialogs=[];
  const state={storedRecord:null,loadedForKey:null,schedules:[],sessions:{},
    selectedEnrollmentId:initialEnrollmentId,loading:false,error:'',saving:false,
    modalOpen:true};
  const exports={};
  const selected=editEnrollment??record(userId,initialEnrollmentId).enrollments[0];
  const ctx={
    exports,Error,Set,userId,initialEnrollmentId,recordKey,activeRecordKeyRef,loadRunRef,saveRunRef,
    getAdminCustomerRecord:()=>{const d=deferred();reads.push(d);return d.promise;},
    getProgramScheduleTimeline:()=>{const d=deferred();timelines.push(d);return d.promise;},
    getProgramSessionScheduleMap:()=>{const d=deferred();sessions.push(d);return d.promise;},
    setStoredRecord:v=>state.storedRecord=v,
    setLoadedForKey:v=>state.loadedForKey=v,
    setSchedules:v=>state.schedules=v,
    setSessionScheduleById:v=>state.sessions=v,
    setSelectedEnrollmentId:v=>{state.selectedEnrollmentId=typeof v==='function'?v(state.selectedEnrollmentId):v;},
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    setSaving:v=>state.saving=v,
    setModalOpen:v=>state.modalOpen=v,
    record:blocked?null:record(userId,initialEnrollmentId),
    loading:false,saving:false,error:'',
    edit:{attendance:null,enrollment:selected,date:'2026-10-24',scheduleId:'sch1',notes:''},
    validSchedules:[{id:'sch1'}],
    registerProgramAttendance:args=>{const d=deferred();mutations.push({args,...d});return d.promise;},
    correctProgramAttendance:args=>{const d=deferred();mutations.push({args,...d});return d.promise;},
    showStaffDialog:(...a)=>dialogs.push(a),
    devWarn:()=>{},
    load:async()=>{},
  };
  vm.runInNewContext(compiled,ctx);
  return {load:exports.makeLoad(),save:exports.makeSave(),state,reads,timelines,sessions,
    mutations,dialogs,activeRecordKeyRef,loadRunRef,saveRunRef,recordKey};
}
async function tick(){for(let i=0;i<5;i++)await Promise.resolve();}
async function settle(h,n,r=record(),schedule=[]){
  h.reads[n].resolve(r);h.timelines[n].resolve(schedule);await tick();
}
async function run(){
  {
    const h=harness();const p=h.load();
    h.activeRecordKeyRef.current='B:en2';h.loadRunRef.current++;
    await settle(h,0);
    await p;
    assert.equal(h.state.storedRecord,null,'A must never render after navigation to B');
    assert.equal(h.sessions.length,0,'Stale load must not query attendance session details');
  }
  {
    const h=harness();const p=h.load();
    await settle(h,0,record('B','en1'));await p;
    assert.equal(h.state.storedRecord,null);
    assert.match(h.state.error,/verificar/);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const p=h.load();
    await settle(h,0,record('A','wrong'));await p;
    assert.equal(h.state.storedRecord,null,'Unknown enrollment id must not pick first');
    assert.match(h.state.error,/verificar/);
  }
  {
    const h=harness();const p=h.load();
    await settle(h,0);assert.equal(h.sessions.length,1);
    h.activeRecordKeyRef.current='A:en2';h.loadRunRef.current++;
    h.sessions[0].resolve({session1:'sch1'});await p;
    assert.equal(h.state.storedRecord,null,'Session schedule arriving late must be rejected');
  }
  {
    const h=harness();const old=h.load(),current=h.load();
    await settle(h,1);h.sessions[0].resolve({session1:'sch1'});await current;
    await settle(h,0,record('B','en1'));await old;
    assert.equal(h.state.storedRecord.profile.user_id,'A');
    assert.equal(h.state.loadedForKey,h.recordKey);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const p=h.load();
    h.reads[0].reject(new Error('sin conexión'));h.timelines[0].resolve([]);await p;
    assert.equal(h.state.storedRecord,null);
    assert.equal(h.state.error,'sin conexión');
  }
  {
    const h=harness({editEnrollment:record('B').enrollments[0]});
    await h.save();assert.equal(h.mutations.length,0,'Cannot write an attendance of another customer');
  }
  {
    const h=harness();const p=h.save();
    assert.equal(h.mutations.length,1);
    assert.equal(h.mutations[0].args.enrollmentId,'en1');
    h.activeRecordKeyRef.current='B:en2';h.saveRunRef.current++;
    h.mutations[0].resolve({});await p;
    assert.equal(h.state.modalOpen,true,'Old save must not close modal belonging to new route');
    assert.equal(h.dialogs.length,0);
  }
  for(const token of [
    'loadedForKey === recordKey',
    'nextRecord.profile.user_id !== userId',
    'nextRecord.enrollments.some((item) => item.enrollment.user_id !== userId)',
    'activeRecordKeyRef.current === recordKey',
    'const saveRunId = ++saveRunRef.current',
    'edit.enrollment.enrollment.user_id !== userId',
    'validSchedules.some((schedule) => schedule.id === edit.scheduleId)',
    'activeRecordKeyRef.current !== boundRecordKey',
    'return () => { loadRunRef.current += 1; saveRunRef.current += 1; };',
    'modalOpen && !!record && !loading && !error',
  ])assert.ok(source.includes(token),'Missing attendance isolation contract: '+token);
  console.log('UCAPSA ADMIN ASISTENCIAS: real load/save, wrong user/enrollment, late session map, concurrent refresh, stale writes and disabled actions PASS');
}
await run();
