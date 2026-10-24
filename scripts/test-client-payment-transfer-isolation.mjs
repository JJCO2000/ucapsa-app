import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/client/payment-transfer.tsx','utf8');
const ast=ts.createSourceFile('payment-transfer.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,
  ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
let initializer;
function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='load') initializer=node.initializer;
  ts.forEachChild(node,visit);
}
visit(ast);
assert.ok(initializer&&ts.isCallExpression(initializer),'Missing real client transfer load callback');
const callback=initializer.arguments[0];
assert.ok(callback&&ts.isArrowFunction(callback),'Expected async transfer load arrow');
const script=ts.transpileModule('exports.makeLoad=()=>('+callback.getText(ast)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness({userId='A',obligationId='bill-1',isAdmin=false}={}){
  const transferKey=!isAdmin&&userId&&obligationId?[userId,obligationId].join(':'):'';
  const loadRunRef={current:0},activeTransferKeyRef={current:transferKey};
  const state={obligation:{id:'old'},settings:{clabe:'old'},loadedForKey:'OLD',
    error:null,loading:false};
  const overview=[],bank=[],exports={};
  vm.runInNewContext(script,{
    exports,Promise,userId,obligationId,isAdmin,transferKey,activeTransferKeyRef,loadRunRef,
    setLoading:v=>state.loading=v,
    setError:v=>state.error=v,
    setLoadedForKey:v=>state.loadedForKey=v,
    setObligation:v=>state.obligation=v,
    setSettings:v=>state.settings=v,
    getMyPaymentOverview:()=>{const d=deferred();overview.push(d);return d.promise;},
    getPaymentSettings:()=>{const d=deferred();bank.push(d);return d.promise;},
    withOperationTimeout:p=>p,
    DEFAULT_READ_TIMEOUT_MS:3000,
  });
  return {load:exports.makeLoad(),overview,bank,state,transferKey,activeTransferKeyRef,loadRunRef};
}
const bill=(id,amount=100)=>({id,concept:'Cuota real',remaining_amount:amount});
const settings={is_active:true,bank_name:'Banco UCAPSA',account_holder:'UCAPSA',clabe:Array.from({length:18},(_,i)=>String(i%10)).join('')};
async function microtasks(){for(let i=0;i<5;i++)await Promise.resolve();}
async function verify(){
  {
    const h=harness();const p=h.load();
    assert.equal(h.state.obligation,null,'Must clear prior charge synchronously');
    assert.equal(h.state.settings,null,'Must clear prior bank synchronously');
    assert.equal(h.state.loadedForKey,null);
    h.activeTransferKeyRef.current='B:bill-2';
    h.overview[0].resolve({obligations:[bill('bill-1')]});
    h.bank[0].resolve(settings);
    await p;
    assert.equal(h.state.settings,null,'Prior account bank response must not become visible');
    assert.equal(h.state.obligation,null);
    assert.equal(h.state.loadedForKey,null);
  }
  {
    const h=harness();const old=h.load(),latest=h.load();
    h.overview[1].resolve({obligations:[bill('bill-1',200)]});
    h.bank[1].resolve(settings);await latest;
    h.overview[0].resolve({obligations:[bill('bill-1',300)]});
    h.bank[0].resolve({...settings,account_holder:'Old'});await old;
    assert.equal(h.state.obligation.remaining_amount,200);
    assert.equal(h.state.settings.account_holder,'UCAPSA');
    assert.equal(h.state.loadedForKey,h.transferKey);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const p=h.load();
    h.overview[0].resolve({obligations:[bill('bill-1')]});
    await microtasks();
    assert.equal(h.state.settings,null,'Bank/charge must not be published until BOTH checks finish');
    assert.equal(h.state.obligation,null);
    h.bank[0].resolve(settings);await p;
    assert.equal(h.state.obligation.id,'bill-1');
    assert.equal(h.state.settings.clabe,settings.clabe);
  }
  {
    const h=harness();const p=h.load();
    h.overview[0].resolve({obligations:[bill('someone-else')]});
    h.bank[0].resolve(settings);await p;
    assert.equal(h.state.obligation,null);
    assert.equal(h.state.settings,null);
    assert.match(h.state.error,/cargo ya no está disponible/);
    assert.equal(h.state.loadedForKey,h.transferKey);
  }
  {
    const h=harness();const p=h.load();
    h.overview[0].resolve({obligations:[bill('bill-1')]});
    h.bank[0].reject(new Error('bank settings offline'));await p;
    assert.equal(h.state.obligation,null);
    assert.equal(h.state.settings,null);
    assert.match(h.state.error,/datos bancarios/);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const p=h.load();
    h.overview[0].reject(new Error('offline'));
    h.bank[0].resolve(settings);await p;
    assert.equal(h.state.settings,null);
    assert.match(h.state.error,/verificar el cargo/);
  }
  {
    const h=harness({obligationId:null});await h.load();
    assert.equal(h.overview.length,0);
    assert.equal(h.bank.length,0);
    assert.match(h.state.error,/No se indicó el cargo/);
    assert.equal(h.state.loading,false);
  }
  {
    const h=harness();const p=h.load();
    h.activeTransferKeyRef.current='A:another-bill';
    h.overview[0].resolve({obligations:[bill('bill-1')]});
    h.bank[0].resolve(settings);await p;
    assert.equal(h.state.loadedForKey,null,'Old route cannot publish another charge');
  }
  for (const token of [
    'const obligation = transferKey && loadedForKey === transferKey ? storedObligation : null;',
    'const settings = transferKey && loadedForKey === transferKey ? storedSettings : null;',
    'activeTransferKeyRef.current === transferKey',
    'setLoadedForKey(null)',
    'setLoadedForKey(transferKey)',
    'setObligation(found)',
    'setSettings(settingsResult.value)',
    'if (!transferKey || activeTransferKeyRef.current !== transferKey',
    '|| !bankReady) return;',
    '!loading && !error && obligation && bankReady',
    'return () => { loadRunRef.current += 1; };',
  ])assert.ok(source.includes(token),'Missing bank/payment isolation guard: '+token);
  assert.ok(!source.includes('Linking.openURL(settings.clip_url)'),
    'Never open an unverified payment link');
  console.log('UCAPSA client transfer: account/obligation isolation, stale responses, matching charge, bank failures, safe copy and navigation guards PASS');
}
await verify();
