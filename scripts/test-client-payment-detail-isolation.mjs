import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const specs=[
  {file:'src/app/client/payment-detail.tsx',id:'paymentId',list:'payments',setter:'setPayment',
    missing:'No encontramos este pago en tu historial actual.',
    offline:'Conéctate para consultar el detalle de este pago.'},
  {file:'src/app/client/payment-obligation-detail.tsx',id:'obligationId',list:'obligations',setter:'setItem',
    missing:'No encontramos este cargo abierto. Puede haberse pagado, cancelado o actualizado.',
    offline:'Conéctate para verificar este cargo antes de pagar.'},
];
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function extract(file){
  const text=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(d=>d.messageText).join(', '));
  let initializer;
  function visit(n){
    if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='load') initializer=n.initializer;
    ts.forEachChild(n,visit);
  }
  visit(ast);
  assert.ok(initializer && ts.isCallExpression(initializer),file+' load callback missing');
  const arrow=initializer.arguments[0];
  assert.ok(arrow && ts.isArrowFunction(arrow),file+' actual load arrow missing');
  const script=ts.transpileModule('exports.makeLoad=()=>('+arrow.getText(ast)+');',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  return {text,script};
}
function harness(spec,{userId='A',targetId='target-1',isAdmin=false}={}){
  const state={detail:null,loadedForKey:null,error:null,loading:false};
  const detailKey=!isAdmin && userId && targetId ? [userId,targetId].join(':') : '';
  const loadRunRef={current:0},activeDetailKeyRef={current:detailKey};
  const calls=[],exports={};
  const args={
    exports,Error,userId,isAdmin,detailKey,loadRunRef,activeDetailKeyRef,
    paymentId:spec.id==='paymentId'?targetId:undefined,
    obligationId:spec.id==='obligationId'?targetId:undefined,
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    setLoadedForKey:v=>state.loadedForKey=v,
    setPayment:v=>state.detail=v,
    setItem:v=>state.detail=v,
    getMyPaymentOverview:()=>{const d=deferred();calls.push(d);return d.promise;},
    withOperationTimeout:p=>p,DEFAULT_READ_TIMEOUT_MS:3000,
  };
  vm.runInNewContext(extract(spec.file).script,args);
  return {state,load:exports.makeLoad(),calls,loadRunRef,activeDetailKeyRef,detailKey};
}
async function tests(spec){
  {
    const h=harness(spec);const p=h.load();
    assert.equal(h.state.detail,null,'Old detail cleared synchronously');
    h.activeDetailKeyRef.current='B:target-2';
    h.calls[0].resolve({[spec.list]:[{id:'target-1',concept:'Private A'}]});
    await p;
    assert.equal(h.state.detail,null,'Old account data must not be committed');
    assert.equal(h.state.loadedForKey,null);
  }
  {
    const h=harness(spec);const older=h.load(),newer=h.load();
    h.calls[1].resolve({[spec.list]:[{id:'target-1',concept:'Latest'}]});await newer;
    h.calls[0].resolve({[spec.list]:[{id:'target-1',concept:'Stale'}]});await older;
    assert.equal(h.state.detail.concept,'Latest','Latest request wins');
    assert.equal(h.state.loadedForKey,h.detailKey);
    assert.equal(h.state.error,null);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness(spec);const p=h.load();
    h.calls[0].reject(new Error('offline'));await p;
    assert.equal(h.state.detail,null);
    assert.equal(h.state.loadedForKey,h.detailKey);
    assert.equal(h.state.error,spec.offline);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness(spec);const p=h.load();
    h.calls[0].resolve({[spec.list]:[]});await p;
    assert.equal(h.state.detail,null);
    assert.equal(h.state.error,spec.missing);
  }
  {
    const h=harness(spec,{targetId:null});await h.load();
    assert.equal(h.calls.length,0,'Do not query without target ID');
    assert.equal(h.state.error,spec.missing);
  }
  const {text}=extract(spec.file);
  for(const token of [
    'activeDetailKeyRef.current === detailKey',
    'const runId = ++loadRunRef.current',
    'setLoadedForKey(null)',
    'setLoadedForKey(detailKey)',
    'if (!isCurrentRun()) return;',
    'return () => { loadRunRef.current += 1; };',
    'setLoading(true);',
  ]) assert.ok(text.includes(token),'Missing protection: '+token+' in '+spec.file);
  if(spec.id==='paymentId'){
    assert.ok(text.includes('const payment = detailKey && loadedForKey === detailKey ? storedPayment : null'),
      'Only current account payment can be visible');
    assert.ok(text.includes('!loading && !error && payment ? ('),
      'Pending/failed payment must not be displayed');
  }else{
    assert.ok(text.includes('const item = detailKey && loadedForKey === detailKey ? storedItem : null'),
      'Only current account obligation can be visible');
    assert.ok(text.includes('!loading && !error && item ? ('),
      'Transfer link must be hidden if the obligation cannot be verified');
  }
}
for(const spec of specs)await tests(spec);
console.log('UCAPSA client payment/obligation detail: session changes, routes, stale refresh, network errors, absent charges and transfer guards PASS');
