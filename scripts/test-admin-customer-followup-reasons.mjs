import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const hook = fs.readFileSync('src/hooks/useAdminCustomerFollowups.ts','utf8');
const ui = fs.readFileSync('src/app/admin/customer.tsx','utf8');
const service = fs.readFileSync('src/services/admin-client-followups.service.ts','utf8');
const list = fs.readFileSync('src/app/(tabs)/admin-clients.tsx','utf8');
const schema = fs.readFileSync('supabase/sql/ucapsa-client-followups.sql','utf8');

const parsed=ts.createSourceFile('useAdminCustomerFollowups.ts',hook,
  ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
assert.equal(parsed.parseDiagnostics.length,0);
let loadDeclaration;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') loadDeclaration=node;
  ts.forEachChild(node,visit);
}
visit(parsed);
assert.ok(loadDeclaration && ts.isCallExpression(loadDeclaration.initializer));
const arrow=loadDeclaration.initializer.arguments[0];
assert.ok(ts.isArrowFunction(arrow));
const output=ts.transpileModule('exports.factory = () => ('+arrow.getText(parsed)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function deferred() {
  let resolve, reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness({userId='A',isAdmin=true}={}) {
  const state={rows:['old'],forUser:'old',loading:false,error:null};
  const calls=[];
  const exports={};
  const loadRunRef={current:0},activeUserIdRef={current:userId};
  vm.runInNewContext(output,{
    exports,Error,userId,isAdmin,loadRunRef,activeUserIdRef,
    setLoading:value=>state.loading=value,
    setError:value=>state.error=value,
    setRows:value=>state.rows=value,
    setResolvedForUserId:value=>state.forUser=value,
    getAdminClientFollowupRows:()=>{const call=deferred();calls.push(call);return call.promise;},
    withOperationTimeout:promise=>promise,
    DEFAULT_READ_TIMEOUT_MS:1000,
  });
  return {load:exports.factory(),state,calls,loadRunRef,activeUserIdRef};
}
const row=(userId,dogId,puppy=false,inactive=false)=>({
  userId,dogId,dogName:'Dog '+dogId,puppyNoContinuity:puppy,
  inactive30d:inactive,puppyDaysSinceCompletion:14,inactivityDays:30,
});
async function run() {
  {
    const h=harness();const loading=h.load();
    h.calls[0].resolve([row('B','privateB',true),row('A','visibleA',true),row('A','visibleB',false,true)]);
    await loading;
    assert.deepEqual(Array.from(h.state.rows, x=>x.dogId),['visibleA','visibleB']);
    assert.equal(h.state.forUser,'A');
    assert.equal(h.state.loading,false);
    assert.equal(h.state.error,null);
  }
  {
    const h=harness();const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.calls[0].resolve([row('A','oldA',true)]);await pending;
    assert.equal(h.state.rows.length,0);
    assert.equal(h.state.forUser,null);
  }
  {
    const h=harness();const old=h.load(),recent=h.load();
    h.calls[1].resolve([row('A','latest',true)]);await recent;
    h.calls[0].resolve([row('A','stale',true)]);await old;
    assert.equal(h.state.rows[0].dogId,'latest');
  }
  {
    const h=harness();const pending=h.load();
    h.calls[0].reject(new Error('offline'));await pending;
    assert.equal(h.state.rows.length,0);
    assert.equal(h.state.forUser,'A');
    assert.match(h.state.error,/No se pudo verificar/);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const pending=h.load();h.calls[0].resolve([]);await pending;
    assert.equal(h.state.rows.length,0);
    assert.equal(h.state.error,null,'Zero flags means confirmed clear, not failed read');
    assert.equal(h.state.forUser,'A');
  }
  {
    const h=harness({isAdmin:false});await h.load();assert.equal(h.calls.length,0);
  }
  for (const token of [
    'resolvedForUserId === userId',
    'isAdmin && Boolean(userId)',
    'activeUserIdRef.current === userId',
    'loadRunRef.current === runId',
    'row.userId === userId',
    'setResolvedForUserId(null)',
    "return () => { loadRunRef.current += 1; activeUserIdRef.current = ''; };",
  ]) assert.ok(hook.includes(token),'Missing follow-up identity gate: '+token);

  for (const token of [
    'useAdminCustomerFollowups(userId, isAdmin)',
    'Requiere seguimiento',
    'Sin seguimiento pendiente',
    'No se pudo verificar el seguimiento',
    'followupError',
    'followups.map((row)',
    'row.puppyNoContinuity',
    'row.inactive30d',
    'row.puppyDaysSinceCompletion',
    'row.inactivityDays',
    'refreshFollowups()',
    "if (!isAdmin) return <Redirect href=\"/home\" />",
  ]) {
    const code=token==='No se pudo verificar el seguimiento'?hook:ui;
    assert.ok(code.includes(token),'Customer followup card lost '+token);
  }
  assert.ok(hook.includes('getAdminClientFollowupRows()')
    && list.includes('getAdminClientFollowupRows()')
    && service.includes("supabase.rpc('get_admin_client_followups')")
    && schema.includes('public.is_ucapsa_admin()'),
    'The list and detail must share one server-authorized followup rule.');
  assert.ok(!ui.includes('v_today - 14')&&!ui.includes('v_today - 30'),
    'Do not recalculate follow-up eligibility in the UI');
  console.log('UCAPSA followup detail: cross-account isolation, stale requests, failure vs confirmed clear, role gate and exact Puppy/attendance reasons PASS');
}
await run();
