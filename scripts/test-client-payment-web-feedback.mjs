import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const testClabe=Array.from({length:18},(_,index)=>String((index+1)%10)).join('');
const paymentSource=fs.readFileSync('src/app/(tabs)/payments.tsx','utf8');
const transferSource=fs.readFileSync('src/app/client/payment-transfer.tsx','utf8');
const helperSource=fs.readFileSync('src/utils/staff-dialog.ts','utf8');

function realFunction(source, name, context) {
  const ast=ts.createSourceFile(name+'.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length,0);
  let definition;
  function walk(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text===name) definition=node;
    ts.forEachChild(node,walk);
  }
  walk(ast);
  assert.ok(definition, 'Real production handler missing: '+name);
  const compiled=ts.transpileModule('exports.call = '+definition.getText(ast)+';',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const output={exports:{}};
  vm.runInNewContext(compiled,{exports:output.exports,Error,...context});
  return output.exports.call;
}

function bankContext({settings=true, valid=true, copied=true}={}) {
  const calls=[], messages=[];
  const bankSettings=settings ? {clabe:valid?testClabe:'1234',
    is_active:true,account_holder:' UCAPSA '} : null;
  const Clipboard={setStringAsync: async text=>{
    calls.push(text);
    if(!copied)throw new Error('clipboard permission');
  }};
  const showPlatformDialog=(title,message)=>messages.push({title,message});
  return {ctx:{bankSettings,Clipboard,showPlatformDialog,
    normalizeClabe:x=>x??'',isValidClabe:x=>/^\d{18}$/.test(x)},
    calls,messages};
}
async function checkHub(){
  {
    const h=bankContext();
    await realFunction(paymentSource,'copyClabe',h.ctx)();
    assert.deepEqual(h.calls,[testClabe]);
    assert.equal(h.messages[0].title,'CLABE copiada');
  }
  {
    const h=bankContext({valid:false});
    await realFunction(paymentSource,'copyClabe',h.ctx)();
    assert.equal(h.calls.length,0,'Invalid bank account must not be copied');
    assert.equal(h.messages[0].title,'CLABE no verificada');
  }
  {
    const h=bankContext({copied:false});
    await realFunction(paymentSource,'copyClabe',h.ctx)();
    assert.equal(h.messages[0].title,'No se pudo copiar');
    assert.ok(!h.messages.some(m=>m.title==='CLABE copiada'),
      'Never claim a CLABE was copied when clipboard failed');
  }
  {
    const h=bankContext();
    await realFunction(paymentSource,'copyAccountHolder',h.ctx)();
    assert.deepEqual(h.calls,['UCAPSA']);
    assert.equal(h.messages[0].title,'Titular copiado');
  }
  {
    const h=bankContext({copied:false});
    await realFunction(paymentSource,'copyAccountHolder',h.ctx)();
    assert.equal(h.messages[0].title,'No se pudo copiar');
    assert.ok(!h.messages.some(m=>m.title==='Titular copiado'));
  }
}
async function checkTransfer(){
  {
    const h=bankContext();
    const transferKey='A:bill1';
    const ctx={...h.ctx,transferKey,activeTransferKeyRef:{current:transferKey},
      loadedForKey:transferKey,loading:false,error:null,obligation:{id:'bill1'},
      settings:h.ctx.bankSettings,bankReady:true};
    await realFunction(transferSource,'copyClabe',ctx)();
    assert.deepEqual(h.calls,[testClabe]);
    assert.equal(h.messages[0].title,'CLABE copiada');
  }
  {
    const h=bankContext();
    const transferKey='A:bill1';
    const ctx={...h.ctx,transferKey,activeTransferKeyRef:{current:'B:bill2'},
      loadedForKey:transferKey,loading:false,error:null,obligation:{id:'bill1'},
      settings:h.ctx.bankSettings,bankReady:true};
    await realFunction(transferSource,'copyClabe',ctx)();
    assert.equal(h.calls.length,0,'Do not copy bank data after a route/account change');
  }
  {
    const h=bankContext({copied:false});
    const transferKey='A:bill1';
    const ctx={...h.ctx,transferKey,activeTransferKeyRef:{current:transferKey},
      loadedForKey:transferKey,loading:false,error:null,obligation:{id:'bill1'},
      settings:h.ctx.bankSettings,bankReady:true};
    await realFunction(transferSource,'copyClabe',ctx)();
    assert.equal(h.messages[0].title,'No se pudo copiar');
  }
  {
    const h=bankContext();
    const transferKey='A:bill1';
    let release;
    h.ctx.Clipboard.setStringAsync=()=>new Promise(resolve=>{release=resolve;});
    const ref={current:transferKey};
    const ctx={...h.ctx,transferKey,activeTransferKeyRef:ref,
      loadedForKey:transferKey,loading:false,error:null,obligation:{id:'bill1'},
      settings:h.ctx.bankSettings,bankReady:true};
    const pending=realFunction(transferSource,'copyClabe',ctx)();
    ref.current='B:bill2';
    release();await pending;
    assert.equal(h.messages.length,0,'No stale success notice after switching account');
  }
}
function checkPlatform(){
  const compiled=ts.transpileModule(helperSource,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  }}).outputText;
  const events=[];
  const platform={OS:'web'},exports={};
  vm.runInNewContext(compiled,{
    exports,Error,
    require:(path)=>{
      assert.equal(path,'react-native');
      return {Platform:platform,Alert:{alert:(...args)=>events.push(['native',...args])}};
    },
    window:{alert:message=>events.push(['web',message]),confirm:()=>true},
  });
  assert.equal(exports.showPlatformDialog,exports.showStaffDialog,
    'Use the existing canonical dialog; no second platform implementation.');
  exports.showPlatformDialog('CLABE copiada','Confirma el titular.');
  assert.equal(events[0][0],'web');
  assert.ok(events[0][1].includes('CLABE copiada'));
  platform.OS='android';
  exports.showPlatformDialog('CLABE copiada','Confirma el titular.');
  assert.equal(events[1][0],'native');
}

await checkHub();
await checkTransfer();
checkPlatform();
for(const source of [paymentSource,transferSource]) {
  assert.ok(source.includes("import { showPlatformDialog } from '../../utils/staff-dialog'"));
  assert.ok(!source.includes('Alert.alert('),'Copy and link notices must work on web');
}
assert.ok(transferSource.includes('isValidPaymentLink(settings.clip_url)'),
  'The existing validated payment link may not be bypassed.');
console.log('UCAPSA payment confirmations: web/native copy success, invalid CLABE, clipboard failure, session switch, canonical dialogs PASS');
