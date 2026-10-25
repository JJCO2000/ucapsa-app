import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const hook=fs.readFileSync('src/hooks/useAdminCustomerFollowups.ts','utf8');
const customer=fs.readFileSync('src/app/admin/customer.tsx','utf8');
const dir=fs.readFileSync('src/app/(tabs)/admin-clients.tsx','utf8');
const service=fs.readFileSync('src/services/admin-client-followups.service.ts','utf8');
const clientCheck=fs.readFileSync('scripts/check-client-followups.mjs','utf8');
const fullList=fs.readFileSync('src/app/admin/client-followups.tsx','utf8');

function compiledCallback(code, name, filename) {
  const parsed=ts.createSourceFile(filename,code,ts.ScriptTarget.ES2022,true,
    ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length,0,'TypeScript AST must parse');
  let fn;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed)===name) {
      assert.ok(ts.isCallExpression(node.initializer),'Expected useCallback');
      fn=node.initializer.arguments[0];
    }
    ts.forEachChild(node,walk);
  }
  walk(parsed);
  assert.ok(fn && ts.isArrowFunction(fn),'Expected actual async load callback');
  return ts.transpileModule('exports.load = ('+fn.getText(parsed)+');',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
}
const loadCode=compiledCallback(hook,'load','useAdminCustomerFollowups.ts');
const fullListLoadCode=compiledCallback(fullList,'load','client-followups.tsx');
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(id='A') {
  const state={rows:[],resolvedForUserId:null,loading:true,error:null};
  const requests=[];
  const activeUserIdRef={current:id},loadRunRef={current:0};
  const exports={};
  vm.runInNewContext(loadCode,{
    exports,userId:id,loadRunRef,activeUserIdRef,
    setStoredRows:v=>state.rows=v,
    setResolvedForUserId:v=>state.resolvedForUserId=v,
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    getAdminClientFollowupRows:()=>{
      const d=deferred();requests.push(d);return d.promise;
    },
    DEFAULT_READ_TIMEOUT_MS:6000,
    withOperationTimeout:(promise,ms,label)=>{
      assert.equal(ms,6000);
      assert.equal(label,'admin-customer-followups');
      return promise;
    },
  });
  return {load:exports.load,requests,state,activeUserIdRef,loadRunRef};
}
const row=(userId,dogName)=>({userId,dogName,puppyNoContinuity:false,
  inactive30d:true,inactivityDays:35,puppyDaysSinceCompletion:0});

async function check() {
  {
    const h=harness();
    const pending=h.load();
    h.requests[0].resolve([row('A','Tuka'),row('B','Otro')]);await pending;
    assert.deepEqual(h.state.rows.map(r=>r.dogName),['Tuka'],
      'Summary must filter RPC result by exact customer account');
    assert.equal(h.state.resolvedForUserId,'A');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();
    const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.requests[0].resolve([row('A','Private A')]);await pending;
    assert.equal(h.state.resolvedForUserId,null);
    assert.equal(h.state.rows.length,0,'Old customer response must not be displayed');
  }
  {
    const h=harness();const first=h.load(),later=h.load();
    h.requests[1].resolve([row('A','Latest')]);await later;
    h.requests[0].resolve([row('A','Stale')]);await first;
    assert.equal(h.state.rows[0].dogName,'Latest');
  }
  {
    const h=harness();const old=h.load();
    h.requests[0].reject(new Error('Network'));await old;
    assert.equal(h.state.error,'No pudimos verificar el seguimiento.');
    assert.equal(h.state.resolvedForUserId,'A');
    assert.equal(h.state.rows.length,0);
    assert.equal(h.state.loading,false);
  }

  const start=customer.indexOf('function followupReasons(');
  const end=customer.indexOf('\nexport default function AdminCustomerScreen()',start);
  assert.ok(start>=0&&end>start,'Must reuse real UI reason formatter');
  const generated=ts.transpileModule(customer.slice(start,end)+
    '\nexports.reasonList=followupReasons;',{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText;
  const exports={};
  vm.runInNewContext(generated,{exports});
  const realReasons=exports.reasonList;
  assert.deepEqual(JSON.parse(JSON.stringify(realReasons([
    {...row('A','Tuka'),puppyNoContinuity:true,puppyDaysSinceCompletion:18},
  ]))),[
    'Tuka: terminó Puppy hace 18 días y no tiene inscripción posterior.',
    'Tuka: 35 días sin asistencia registrada.',
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(realReasons([]))),[]);
  assert.deepEqual(JSON.parse(JSON.stringify(realReasons([{...row('A','Sin bandera'),
    inactive30d:false}]))),[]);

  for (const token of [
    'const rows = resolvedForUserId === userId ? storedRows : []',
    'loadRunRef.current === runId && activeUserIdRef.current === userId',
    'setResolvedForUserId(null)',
    'allRows.filter((row) => row.userId === userId)',
    "return () => { loadRunRef.current += 1; activeUserIdRef.current = ''; }",
  ]) assert.ok(hook.includes(token),'Customer follow-up isolation missing: '+token);
  for (const token of [
    'useAdminCustomerDetail(userId)',
    'useAdminCustomerFollowups(userId)',
    '<Metric label="Saldo" value={money(pendingBalance)} small />',
    'Seguimiento</Text>',
    'Requiere seguimiento',
    'Sin seguimiento',
    'No disponible',
    'reasons.slice(0, 4)',
    "router.push('/admin/client-followups'",
    "styles.followupMetric",
    "width: '100%'",
  ]) assert.ok(customer.includes(token),'Follow-up quick summary missing: '+token);
  assert.ok(dir.includes('getAdminClientFollowupRows()') &&
    service.includes("supabase.rpc('get_admin_client_followups')") &&
    clientCheck.includes('Seguimiento:'),
    'Directory, summary and Admin must continue using one Supabase RPC');
}

function fullListHarness(isAdmin=true) {
  const state={rows:['previous'],loading:true,error:null};
  const requests=[];
  const loadRunRef={current:0};
  const exports={};
  vm.runInNewContext(fullListLoadCode,{
    exports,isAdmin,loadRunRef,
    setRows:v=>state.rows=v,
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    getAdminClientFollowupRows:()=>{
      const d=deferred();requests.push(d);return d.promise;
    },
    DEFAULT_READ_TIMEOUT_MS:6000,
    withOperationTimeout:(promise,ms,label)=>{
      assert.equal(ms,6000);
      assert.equal(label,'admin-client-followups-load');
      return promise;
    },
    friendlyReadError:message=>message+' Revisa tu conexión e intenta de nuevo.',
  });
  return {load:exports.load,requests,state,loadRunRef};
}

async function checkFullList() {
  {
    const h=fullListHarness();
    const first=h.load(),second=h.load();
    assert.equal(h.state.rows.length,0,'The list must not show old rows during refresh');
    h.requests[1].resolve([row('A','New')]);await second;
    h.requests[0].resolve([row('B','Stale')]);await first;
    assert.equal(h.state.rows[0].dogName,'New','Late prior result must not overwrite latest list');
    assert.equal(h.state.loading,false);
  }
  {
    const h=fullListHarness();
    const first=h.load(),second=h.load();
    h.requests[1].resolve([row('A','Verified')]);await second;
    h.requests[0].reject(new Error('late failure'));await first;
    assert.equal(h.state.rows[0].dogName,'Verified');
    assert.equal(h.state.error,null,'Old errors must not invalidate successful newer results');
  }
  {
    const h=fullListHarness();
    const current=h.load();
    h.requests[0].reject(new Error('timeout'));await current;
    assert.equal(h.state.rows.length,0,'Failed refresh must clear old alerts');
    assert.match(h.state.error,/No se pudo actualizar/);
    assert.equal(h.state.loading,false);
  }
  {
    const h=fullListHarness();
    const old=h.load();
    h.loadRunRef.current++;
    h.requests[0].resolve([row('A','Closed screen')]);await old;
    assert.equal(h.state.rows.length,0,'Blurred screen must not commit private rows');
  }
  {
    const h=fullListHarness(false);
    await h.load();
    assert.equal(h.requests.length,0,'Non-Admin may not read followups from the client');
  }
  for(const token of [
    'const loadRunRef = useRef(0)',
    'const runId = ++loadRunRef.current',
    'if (!isCurrentRun()) return;',
    'setRows([])',
    "return () => { loadRunRef.current += 1; setRows([]); }",
    '!loading && !error && rows.map',
  ]) assert.ok(fullList.includes(token),'Missing full-list follow-up protection: '+token);
}

await check();
await checkFullList();
assert.ok(hook.includes("withOperationTimeout(") && hook.includes("DEFAULT_READ_TIMEOUT_MS") && hook.includes("'admin-customer-followups'"),'Detail followup must have bounded read latency');
console.log('UCAPSA Admin customer follow-up summary and list PASS: exact user, stale fetch, timeout error, concurrent loads, focus cleanup and shared RPC.');
