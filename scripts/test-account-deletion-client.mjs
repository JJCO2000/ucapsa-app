import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/services/account-deletion.service.ts','utf8');
const settings=fs.readFileSync('src/app/account-settings.tsx','utf8');
const edge=fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;

class MockFunctionsHttpError extends Error {
  constructor(payload,broken=false) {
    super('Edge Function returned a non-2xx status code');
    this.context={json:async()=>{
      if(broken)throw new Error('invalid-json');
      return payload;
    }};
  }
}
function harness(outcome) {
  let calls=0;
  const supabase={functions:{invoke:async(name,args)=>{
    calls++;
    assert.equal(name,'delete-account');
    assert.deepEqual(args,{body:{}});
    return outcome;
  }}};
  const exports={};
  vm.runInNewContext(js,{exports,require:(name)=>{
    if(name==='@supabase/supabase-js')return {FunctionsHttpError:MockFunctionsHttpError};
    if(name==='../lib/supabase')return {supabase};
    throw new Error('Unexpected import '+name);
  },Error,Array});
  return {run:exports.deleteMyAccount,calls:()=>calls};
}
{
  const h=harness({data:{deleted:true,auditRecorded:true},error:null});
  assert.deepEqual(await h.run(),{auditRecorded:true});
  assert.equal(h.calls(),1);
}
{
  const h=harness({data:{deleted:true,auditRecorded:false},error:null});
  assert.deepEqual(await h.run(),{auditRecorded:false});
}
{
  const h=harness({data:{deleted:true},error:null});
  assert.deepEqual(await h.run(),{auditRecorded:true},'Backward compatible with Edge v2');
}
{
  const err=new MockFunctionsHttpError({
    error:'La solicitud quedó registrada. Hay relaciones que requieren revisión antes de eliminar esta cuenta.',
  });
  const h=harness({data:null,error:err});
  await assert.rejects(h.run(),/La solicitud quedó registrada/);
}
{
  const h=harness({data:null,error:new MockFunctionsHttpError({},true)});
  await assert.rejects(h.run(),/non-2xx status code/);
}
{
  const h=harness({data:{deleted:false,error:'Reintenta después.'},error:null});
  await assert.rejects(h.run(),/Reintenta después/);
}
{
  const err=new Error('Network unreachable');
  const h=harness({data:null,error:err});
  await assert.rejects(h.run(),/Network unreachable/);
}
assert.ok(settings.includes('const receipt = await withOperationTimeout('));
assert.ok(settings.includes('receipt.auditRecorded'));
assert.ok(settings.includes('account deleted but local sign-out failed'));
assert.ok(settings.includes("showPlatformDialog('Cuenta eliminada'"));
assert.ok(edge.includes('auditRecorded = true'));
assert.ok(edge.includes('deleted: true, auditRecorded'));
console.log('UCAPSA delete-account client contract: 409 message, network fallback, success v2/v3, audit warning, local signout resilience PASS');
