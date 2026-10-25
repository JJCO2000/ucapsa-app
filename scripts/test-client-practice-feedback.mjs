import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Test the actual UI callbacks, not a rewritten mock implementation.
const source=fs.readFileSync('src/app/client/practice-activity.tsx','utf8');
const ast=ts.createSourceFile('practice-activity.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0);
function extract(name) {
  let node=null;
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.name?.text===name) node=n;
    ts.forEachChild(n,visit);
  }
  visit(ast);
  assert.ok(node, 'Expected UI callback '+name);
  const compiled=ts.transpileModule(node.getText(ast)+'\nexports.callback='+name+';',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  return (context)=>{
    const exports={};
    vm.runInNewContext(compiled,{exports,Error,...context});
    return exports.callback;
  };
}
const makeToggle=extract('toggleTarget');
const makeSave=extract('savePractice');
function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function targetHarness() {
  const user={id:'account-a'};
  const activeUserIdRef={current:user.id};
  const state={saving:false,targetDays:[1,3],messages:[],warnings:[]};
  const tasks=[];
  const fn=makeToggle({
    user,savingTarget:false,currentUserReady:true,loading:false,error:null,
    activeUserIdRef,targetDays:state.targetDays,
    setSavingTarget:v=>state.saving=v,
    setTargetDays:v=>state.targetDays=v,
    togglePracticeTargetDay:(...args)=>{const d=deferred();tasks.push({args,...d});return d.promise;},
    devWarn:(...args)=>state.warnings.push(args),
    showPlatformDialog:(...args)=>state.messages.push(args),
  });
  return {fn,activeUserIdRef,state,tasks};
}

async function run() {
  // Failed local save must not cause a rejected event handler or falsely mark a day.
  {
    const h=targetHarness(),pending=h.fn(5);
    assert.equal(h.state.saving,true);
    h.tasks[0].reject(new Error('storage full'));await pending;
    assert.deepEqual(h.state.targetDays,[1,3]);
    assert.equal(h.state.saving,false);
    assert.equal(h.state.messages.length,1);
    assert.equal(h.state.warnings.length,1);
  }
  // Success updates the UI from the saved value.
  {
    const h=targetHarness(),pending=h.fn(5);
    assert.equal(h.tasks[0].args[0],'account-a');
    h.tasks[0].resolve([1,3,5]);await pending;
    assert.deepEqual(h.state.targetDays,[1,3,5]);
    assert.equal(h.state.messages.length,0);
  }
  // Changing accounts during a failed save must not display private old-session feedback.
  {
    const h=targetHarness(),pending=h.fn(5);
    h.activeUserIdRef.current='account-b';
    h.tasks[0].reject(new Error('storage failure'));await pending;
    assert.equal(h.state.messages.length,0);
    assert.deepEqual(h.state.targetDays,[1,3]);
  }
  // Web + native use the existing shared platform adapter for save success/failure.
  const state={saving:false,modal:true,alerts:[],logs:[],loads:0};
  const user={id:'account-a'},activeUserIdRef={current:'account-a'};
  const pending=deferred();
  const make=()=>{
    return makeSave({
      user,currentUserReady:true,loading:false,error:null,
      activeProgram:{enrollment:{id:'enrollment-a',dog_id:'dog-a'}},
      startedAt:'2026-10-24T12:00:00Z',difficulty:'easy',note:'',
      activeUserIdRef,
      setSaving:v=>state.saving=v,setModalOpen:v=>state.modal=v,
      getProgramEnrollmentDogName:()=> 'Perro',
      saveMyPracticeSession:()=>pending.promise,
      load:async()=>{state.loads++;},
      showPlatformDialog:(...args)=>state.alerts.push(args),
      devWarn:(...args)=>state.logs.push(args),
    });
  };
  {
    const p=make()();
    pending.resolve({syncStatus:'synced'});await p;
    assert.equal(state.modal,false);
    assert.equal(state.alerts.length,1);
    assert.equal(state.alerts[0][0],'Práctica guardada');
    assert.equal(state.loads,1);
  }
  assert.ok(source.includes("import { showPlatformDialog } from '../../utils/staff-dialog'"));
  assert.ok(!source.includes('Alert.alert('), 'Do not use native-only alerts on web');
  assert.ok(source.includes('if (activeUserIdRef.current === user.id)'));
  console.log('UCAPSA practice goal & save feedback: real callbacks, failure recovery, web adapter, success and session change PASS');
}
await run();
