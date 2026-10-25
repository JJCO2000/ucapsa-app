import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compileActualFunction(file, name, context) {
  const source=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,
    file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0);
  let fn;
  function walk(node) {
    if(ts.isFunctionDeclaration(node)&&node.name?.text===name) fn=node;
    ts.forEachChild(node,walk);
  }
  walk(ast);
  assert.ok(fn,'Missing function '+name+' in '+file);
  const js=ts.transpileModule('exports.fn='+fn.getText(ast).replace(/^export\s+/,'')+';',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports={};
  vm.runInNewContext(js,{exports,Error,...context});
  return {call:exports.fn,source};
}

function dialogHarness(approved) {
  const events=[];
  const helper=compileActualFunction('src/utils/staff-dialog.ts','showPlatformDialog',{
    Platform:{OS:'web'},
    window:{alert:text=>events.push('alert:'+text),
      confirm:text=>{events.push('confirm:'+text);return approved;}},
    Alert:{alert:()=>{throw new Error('Native Alert must not run on web');}},
  }).call;
  return {helper,events};
}

async function testPublishing() {
  for (const approved of [false,true]) {
    const {helper,events}=dialogHarness(approved);
    const flow=[];
    const {call,source}=compileActualFunction('src/app/admin/privacy-notice-form.tsx',
      'publish',{
        missing:[],
        currentId:'legal-draft-id',
        save:async()=>{throw new Error('No redundant save with stored draft id');},
        showPlatformDialog:helper,
        setSaving:value=>flow.push('saving:'+value),
        publishPrivacyNotice:async id=>{flow.push('publish:'+id);return{id};},
        router:{replace:path=>flow.push('route:'+path)},
      });
    await call();
    assert.equal(events.length,1);
    assert.ok(events[0].includes('confirm:Publicar aviso'));
    assert.equal(flow.length,0,'Opening the confirmation must never publish automatically');
    assert.ok(source.includes("import { showPlatformDialog } from '../../utils/staff-dialog'"));
    assert.ok(!source.includes('Alert.alert('));
    // The real browser helper has already invoked the async onPress when approved.
    // Await a microtask for the confirmation's async continuation.
    for(let i=0;i<5;i++)await Promise.resolve();
    if (approved) {
      assert.ok(flow.includes('publish:legal-draft-id'));
      assert.ok(flow.includes('route:/admin/privacy-notices'));
      assert.equal(flow.at(-1),'saving:false');
    } else assert.deepEqual(flow,[]);
  }
  {
    const dialogs=[];
    const {call}=compileActualFunction('src/app/admin/privacy-notice-form.tsx','publish',{
      missing:['Data categories'],currentId:'draft',
      showPlatformDialog:(title,message,buttons)=>dialogs.push({title,message,buttons}),
    });
    await call();
    assert.equal(dialogs[0].title,'Aviso incompleto');
    assert.equal(dialogs[0].buttons,undefined);
  }
  {
    const dialogs=[],events=[];
    const {call}=compileActualFunction('src/app/admin/privacy-notice-form.tsx','publish',{
      missing:[],currentId:null,
      save:async()=>({id:'created-draft'}),
      showPlatformDialog:(title,message,buttons)=>dialogs.push({title,message,buttons}),
      setSaving:v=>events.push('saving:'+v),
      publishPrivacyNotice:async id=>{events.push('publish:'+id);return{id};},
      router:{replace:path=>events.push('route:'+path)},
    });
    await call();
    assert.equal(dialogs[0].title,'Publicar aviso');
    assert.equal(events.length,0,'A newly created draft also requires affirmative confirmation');
    await dialogs[0].buttons[1].onPress();
    assert.ok(events.includes('publish:created-draft'));
    assert.ok(events.includes('route:/admin/privacy-notices'));
  }
  {
    const dialogs=[];
    const {call}=compileActualFunction('src/app/admin/privacy-notice-form.tsx','publish',{
      missing:[],currentId:'draft',
      showPlatformDialog:(title,msg,buttons)=>dialogs.push({title,msg,buttons}),
      setSaving:()=>{},
      publishPrivacyNotice:async()=>{throw new Error('No autorizado');},
      router:{replace:()=>{throw new Error('Must not navigate on failure');}},
    });
    await call();
    await dialogs[0].buttons[1].onPress();
    assert.equal(dialogs[1].title,'No se pudo publicar');
    assert.equal(dialogs[1].msg,'No autorizado');
  }
}

async function main() {
  // Actual shared implementation: web alert and confirmation are visible.
  {
    const denied=dialogHarness(false),approved=dialogHarness(true);
    const events=[];
    denied.helper('Publicar aviso','No publicar sin revisión',
      [{text:'Cancelar',style:'cancel'},{text:'Publicar',onPress:()=>events.push('published')}]);
    assert.equal(events.length,0);
    approved.helper('Publicar aviso','Confirmar aprobación',
      [{text:'Cancelar',style:'cancel'},{text:'Publicar',onPress:()=>events.push('published')}]);
    assert.deepEqual(events,['published']);
    approved.helper('Error','Mensaje visible');
    assert.ok(approved.events.some(x=>x.startsWith('alert:Error')));
  }
  await testPublishing();
  const list=fs.readFileSync('src/app/admin/privacy-notices.tsx','utf8');
  assert.ok(list.includes("showPlatformDialog('No se pudieron cargar avisos'"));
  assert.ok(!list.includes('Alert.alert('));
  console.log('UCAPSA privacidad Superadmin: guardar/revisar/publicar con diálogos visibles en web y Android, sin publicación automática PASS');
}
await main();
