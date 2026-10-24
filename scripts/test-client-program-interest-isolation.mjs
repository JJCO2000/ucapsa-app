import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/client/program-interest.tsx','utf8');
const parsed=ts.createSourceFile('program-interest.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,
  parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let loadInitializer,submitNode;
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load')
    loadInitializer=node.initializer;
  if (ts.isFunctionDeclaration(node) && node.name?.text==='submit') submitNode=node;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(loadInitializer && ts.isCallExpression(loadInitializer),'Actual async load callback missing');
assert.ok(ts.isArrowFunction(loadInitializer.arguments[0]),'Load must be arrow');
assert.ok(submitNode,'Actual submit function missing');
const fnSource='exports.createLoad = () => ('+loadInitializer.arguments[0].getText(parsed)+');\n'+
  'exports.createSubmit = () => '+submitNode.getText(parsed).replace('async function submit()','async function submit()')+
  '\nexports.submit=submit;'; // created in closure, used from the same context
// Export a standalone function instead, to preserve free variables injected via VM.
const combined='exports.load = ('+loadInitializer.arguments[0].getText(parsed)+');\n'+
  submitNode.getText(parsed)+'\nexports.submit = submit;';
const transpiled=ts.transpileModule(combined,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
function defer(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function harness(){
  const calls={dogs:[],requests:[],enrollments:[],writes:[],alerts:[],warnings:[]};
  const state={dogs:[{id:'old-dog'}],dogId:'old-dog',requests:[{id:'private-old'}],
    programs:['old-dog:puppy'],loadedFor:'old',loading:true,error:null,
    savedFor:null,sendingFor:null};
  const userId='A',dogId='dog1',program='puppy';
  const loadRunRef={current:0},activeUserIdRef={current:userId};
  const activeSelectionRef={current:[userId,dogId,program].join(':')};
  const exports={};
  vm.runInNewContext(transpiled,{
    exports,Error,userId,isAdmin:false,loadRunRef,activeUserIdRef,activeSelectionRef,
    dogId,program,selectedDog:{id:dogId,name:'Dog A'},
    verifiedForUser:true,loading:false,error:null,sending:false,current:null,alreadyEnrolled:false,
    setError:v=>state.error=v,
    setLoading:v=>state.loading=v,
    setLoadedForUserId:v=>state.loadedFor=v,
    setDogs:v=>state.dogs=v,
    setDogId:v=>state.dogId=typeof v==='function'?v(state.dogId):v,
    setOpenRequests:v=>state.requests=typeof v==='function'?v(state.requests):v,
    setActiveByProgram:v=>state.programs=v,
    setSavedForUserId:v=>state.savedFor=v,
    setSendingForUserId:v=>state.sendingFor=typeof v==='function'?v(state.sendingFor):v,
    getMyDogs:()=>{const d=defer();calls.dogs.push(d);return d.promise;},
    getMyProgramInterestRequests:()=>{const d=defer();calls.requests.push(d);return d.promise;},
    getMyProgramEnrollments:()=>{const d=defer();calls.enrollments.push(d);return d.promise;},
    requestProgramInterest:(...args)=>{const d=defer();calls.writes.push({args,...d});return d.promise;},
    devWarn:(...args)=>calls.warnings.push(args),
    Alert:{alert:(...args)=>calls.alerts.push(args)},
    contactWhatsapp:()=>{},
  });
  return{state,calls,load:exports.load,submit:exports.submit,activeUserIdRef,loadRunRef,activeSelectionRef};
}
function finish(h,i,values={}){
  h.calls.dogs[i].resolve(values.dogs??[{id:'dog1',name:'Dog A'}]);
  h.calls.requests[i].resolve(values.requests??[]);
  h.calls.enrollments[i].resolve(values.enrollments??[]);
}
async function spin(){for(let i=0;i<8;i++)await Promise.resolve();}
async function tests(){
  {
    const h=harness(),pending=h.load();
    h.activeUserIdRef.current='B';
    h.loadRunRef.current++;
    finish(h,0,{dogs:[{id:'private-A'}]});
    await pending;
    assert.equal(h.state.loadedFor,null);
    assert.equal(h.state.dogs.length,0);
    assert.equal(h.state.loading,true);
  }
  {
    const h=harness(),old=h.load(),fresh=h.load();
    finish(h,1,{dogs:[{id:'latest-dog'}],requests:[{id:'latest-request'}],
      enrollments:[{enrollment:{status:'active',dog_id:'latest-dog'},program:{code:'puppy'}}]});
    await fresh;
    finish(h,0,{dogs:[{id:'stale-dog'}],requests:[{id:'stale-request'}]});
    await old;
    assert.equal(h.state.loadedFor,'A');
    assert.equal(h.state.dogs[0].id,'latest-dog');
    assert.equal(h.state.requests[0].id,'latest-request');
    assert.equal(h.state.programs[0],'latest-dog:puppy');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness(),pending=h.load();
    h.calls.dogs[0].resolve([{id:'dog1'}]);
    h.calls.requests[0].reject(new Error('offline'));
    h.calls.enrollments[0].resolve([]);
    await pending;
    assert.equal(h.state.loadedFor,null);
    assert.equal(h.state.dogs.length,0);
    assert.ok(h.state.error?.includes('No pudimos verificar'));
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness(),p=h.submit();
    assert.deepEqual(h.calls.writes[0].args,['A','dog1','puppy']);
    h.activeUserIdRef.current='B';
    h.calls.writes[0].resolve({id:'new-interest',user_id:'A'});
    await p;
    assert.equal(h.state.savedFor,null);
    assert.equal(h.calls.alerts.length,0);
  }
  {
    const h=harness(),p=h.submit();
    h.activeSelectionRef.current='A:dog2:comandos';
    h.calls.writes[0].resolve({id:'new-interest',dog_id:'dog1',program_code:'puppy'});
    await p;
    assert.equal(h.state.savedFor,null);
    assert.equal(h.calls.alerts.length,0);
    assert.equal(h.state.requests[0].id,'new-interest','Recorded request should still update own account collection');
  }
  {
    const h=harness(),p=h.submit();
    h.calls.writes[0].resolve({id:'new-interest',dog_id:'dog1',program_code:'puppy'});
    await p;
    assert.equal(h.state.savedFor,'A');
    assert.equal(h.state.sendingFor,null);
    assert.equal(h.calls.alerts[0][0],'Interés registrado');
  }
  for (const token of [
    'const verifiedForUser = Boolean(userId && loadedForUserId === userId)',
    'const dogs = verifiedForUser ? storedDogs : []',
    'const openRequests = verifiedForUser ? storedRequests : []',
    'const activeByProgram = verifiedForUser ? storedActiveByProgram : []',
    'activeUserIdRef.current === userId',
    'setLoadedForUserId(null)',
    'setLoadedForUserId(userId)',
    'if (!isCurrentRun()) return;',
    'return () => { loadRunRef.current += 1; };',
    'if (!userId || !verifiedForUser || loading || error',
    'if (!isCurrentUser()) return;',
    'activeSelectionRef.current !== selectionKey',
    'disabled={loading || !verifiedForUser',
  ]) assert.ok(source.includes(token),'Missing private-interest boundary: '+token);
}
await tests();
console.log('UCAPSA client program interest: stale-account and out-of-order reads, fail-closed verification, write isolation, selection change and success PASS');
