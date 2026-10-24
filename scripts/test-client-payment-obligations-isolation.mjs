import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file='src/app/client/payment-obligations.tsx';
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,
  ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
let initializer;
function walk(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='load') initializer=node.initializer;
  ts.forEachChild(node,walk);
}
walk(ast);
assert.ok(initializer && ts.isCallExpression(initializer),'Real load callback missing');
const arrow=initializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow),'Real async load missing');
const compiled=ts.transpileModule('exports.createLoad=()=>('+arrow.getText(ast)+');',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const emptyOverview={obligations:[],payments:[],outstanding_total:0,
  attention_total:0,future_total:0,overdue_count:0,legacy_membership_pending:false};
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(userId='A'){
  const state={overview:emptyOverview,loadedFor:null,error:null,loading:true};
  const calls=[],exports={};
  const loadRunRef={current:0},activeUserIdRef={current:userId};
  vm.runInNewContext(compiled,{
    exports,Error,
    user:{id:userId},isAdmin:false,loadRunRef,activeUserIdRef,emptyOverview,
    setOverview:v=>state.overview=v,
    setLoadedForUserId:v=>state.loadedFor=v,
    setError:v=>state.error=v,
    setLoading:v=>state.loading=v,
    getMyPaymentOverview:()=>{const d=deferred();calls.push(d);return d.promise;},
    withOperationTimeout:p=>p,DEFAULT_READ_TIMEOUT_MS:3000,
  });
  return {load:exports.createLoad(),state,calls,loadRunRef,activeUserIdRef};
}
const data=(id)=>({obligations:[{id,concept:'Private '+id}],outstanding_total:100});
{
  const h=harness();const pending=h.load();
  h.activeUserIdRef.current='B';h.loadRunRef.current++;
  h.calls[0].resolve(data('A'));await pending;
  assert.equal(h.state.loadedFor,null,'Previous account response must never be committed');
  assert.equal(h.state.overview,emptyOverview);
}
{
  const h=harness();const old=h.load(),recent=h.load();
  h.calls[1].resolve(data('new'));await recent;
  h.calls[0].resolve(data('old'));await old;
  assert.equal(h.state.overview.obligations[0].id,'new');
  assert.equal(h.state.loadedFor,'A');
  assert.equal(h.state.loading,false);
}
{
  const h=harness();const pending=h.load();
  h.calls[0].reject(new Error('offline'));await pending;
  assert.equal(h.state.loadedFor,null);
  assert.equal(h.state.overview,emptyOverview);
  assert.equal(h.state.error,'Conéctate para consultar el detalle de tus cargos.');
  assert.equal(h.state.loading,false);
}
for(const token of [
  'const overview = loadedForUserId === user?.id ? storedOverview : emptyOverview',
  'activeUserIdRef.current === userId',
  'setLoadedForUserId(userId)',
  'setLoadedForUserId(null)',
  'setOverview(emptyOverview)',
  'return () => { loadRunRef.current += 1; }',
  '!loading && !error ? (',
]) assert.ok(source.includes(token),'Missing payment account isolation: '+token);
console.log('UCAPSA client open obligations: stale account, latest refresh, failure redaction, navigation and action guards PASS');
