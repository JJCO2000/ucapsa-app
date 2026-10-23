import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function extractRealLoad(file, context) {
  const source = fs.readFileSync(file,'utf8');
  const parsed = ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length,0,
    file+': '+parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
  let initializer;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') {
      initializer = node.initializer;
    }
    ts.forEachChild(node,walk);
  }
  walk(parsed);
  assert.ok(initializer && ts.isCallExpression(initializer),'Expected the real load useCallback');
  const arrow = initializer.arguments[0];
  assert.ok(arrow && ts.isArrowFunction(arrow),'Expected async load arrow');
  const compiled = ts.transpileModule('exports.makeLoad = () => ('+arrow.getText(parsed)+');',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled,{exports,Error,...context});
  return {load:exports.makeLoad(),source};
}

function harness(kind) {
  const state={rows:[],overview:null,loadedFor:null,error:null,loading:true,savedAt:null,
    usingSaved:false};
  const cache=[],remote=[],writes=[];
  const loadRunRef={current:0},activeUserIdRef={current:'A'};
  const ctx={
    user:{id:'A'},isAdmin:false,loadRunRef,activeUserIdRef,
    setError:v=>state.error=v,
    setLoading:v=>state.loading=v,
    setRows:v=>state.rows=v,
    setOverview:v=>state.overview=v,
    setLoadedForUserId:v=>state.loadedFor=v,
    setUsingSavedData:v=>state.usingSaved=v,
    setSavedAt:v=>state.savedAt=v,
    readClientResource:()=>{const d=deferred();cache.push(d);return d.promise;},
    getMyProgramEnrollments:()=>{const d=deferred();remote.push(d);return d.promise;},
    getMyPaymentOverview:()=>{const d=deferred();remote.push(d);return d.promise;},
    writeClientResource:async (userId,key,rows)=>{writes.push({userId,key,rows});return {saved_at:'now'};},
    sanitizeProgramRowsForCache:rows=>rows,
    clientReadKeys:{programs:'programs'},
    withOperationTimeout:p=>p,
    DEFAULT_READ_TIMEOUT_MS:3000,
    friendlyReadError:message=>message,
  };
  const {load,source}=extractRealLoad(
    kind==='attendance'?'src/app/client/attendance-history.tsx':'src/app/client/payment-history.tsx',
    ctx);
  return {load,source,state,cache,remote,writes,loadRunRef,activeUserIdRef};
}

async function microtasks() { for(let i=0;i<4;i++) await Promise.resolve(); }

async function testAttendance() {
  {
    const h=harness('attendance');
    const pending=h.load();
    assert.equal(h.cache.length,1);
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.cache[0].resolve({data:[{enrollment:{id:'private-A'}}],saved_at:'yesterday'});
    await pending;
    assert.equal(h.state.loadedFor,null,'Prior user cache should not become visible');
    assert.equal(h.remote.length,0,'Stale cache must not trigger remote reads');
  }
  {
    const h=harness('attendance');
    const a=h.load();const b=h.load();
    h.cache[1].resolve(null); await microtasks();
    assert.equal(h.remote.length,1);
    h.remote[0].resolve([{enrollment:{id:'B-latest'}}]);await b;
    h.cache[0].resolve({data:[{enrollment:{id:'A-stale'}}],saved_at:'old'});await a;
    assert.equal(h.state.loadedFor,'A');
    assert.equal(h.state.rows[0].enrollment.id,'B-latest');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness('attendance');
    const p=h.load();
    h.cache[0].resolve(null);await microtasks();
    h.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.error,'No se pudieron cargar tus asistencias.');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness('attendance');
    const p=h.load();h.cache[0].resolve({data:[{enrollment:{id:'offline-A'}}],saved_at:'old'});
    await microtasks();
    h.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.usingSaved,true,'Offline cache can still be used for the SAME account');
    assert.equal(h.state.rows[0].enrollment.id,'offline-A');
  }
  const s=harness('attendance').source;
  for(const token of [
    'const rows = loadedForUserId === user?.id ? storedRows : []',
    'activeUserIdRef.current === userId',
    'if (!isCurrentRun()) return;',
    'setLoadedForUserId(userId)',
    'setLoadedForUserId(null)',
    'return () => { loadRunRef.current += 1; }',
    '!loading && !error && (aggregate || item)',
  ]) assert.ok(s.includes(token),'Attendance session isolation missing: '+token);
}
async function testPayments(){
  {
    const h=harness('payment');
    const pending=h.load();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    h.remote[0].resolve({payments:[{id:'private-A'}]});await pending;
    assert.equal(h.state.overview,null,'Stale payment response must not be committed');
    assert.equal(h.state.loadedFor,null);
  }
  {
    const h=harness('payment');
    const old=h.load(),recent=h.load();
    h.remote[1].resolve({payments:[{id:'newer'}]});await recent;
    h.remote[0].resolve({payments:[{id:'stale'}]});await old;
    assert.equal(h.state.overview.payments[0].id,'newer');
    assert.equal(h.state.loadedFor,'A');
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness('payment');
    const p=h.load();
    h.remote[0].reject(new Error('offline'));await p;
    assert.equal(h.state.error,'No se pudo cargar el historial de pagos.');
    assert.equal(h.state.loading,false);
  }
  const s=harness('payment').source;
  for(const token of [
    'const overview = loadedForUserId === user?.id ? storedOverview : emptyOverview',
    'activeUserIdRef.current === userId',
    'setLoadedForUserId(userId)',
    'setOverview(emptyOverview)',
    'setLoadedForUserId(null)',
    'return () => { loadRunRef.current += 1; }',
    '!loading && !error && overview.payments.map',
  ]) assert.ok(s.includes(token),'Payments session isolation missing: '+token);
}

await testAttendance();
await testPayments();
console.log('UCAPSA client private-history isolation: stale account, concurrent refresh, offline cache, payment error and blur guards PASS');
