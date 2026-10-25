import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const servicePath='src/services/preregistration-privacy-coverage.service.ts';
const source=fs.readFileSync(servicePath,'utf8');
const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const published={
  id:'01234567-89ab-4cde-8f01-23456789abcd',
  status:'published',
  published_at:'2026-10-25T10:00:00.000Z',
  effective_from:'2026-10-25T00:00:00.000Z',
  simplified_notice:'Aviso de datos y contacto de preinscripciones y familiares; consultar derechos ARCO.',
  integral_notice:'Tratamiento operativo de las preinscripciones; familiares con expediente provisional y notificación.',
};
let response=published,requests=0;
const exports={};
vm.runInNewContext(js,{exports,require:(name)=>{
  assert.equal(name,'./privacy-notice.service');
  return {
    getPublishedPrivacyNotice:async()=>{requests++;return response;},
    getPrivacyNoticeMissingFields:(v)=>v.simplified_notice && v.integral_notice?[]:['integral_notice'],
  };
},Date,Error});
const {validateIntakeNoticeCoverage,assertIntakePublishedNotice}=exports;
assert.equal(validateIntakeNoticeCoverage(published),published.id);
assert.throws(()=>validateIntakeNoticeCoverage(null),/todavía no tiene un aviso vigente/);
assert.throws(()=>validateIntakeNoticeCoverage({...published,status:'draft'}),/aviso vigente/);
assert.throws(()=>validateIntakeNoticeCoverage({...published,published_at:null}),/aviso vigente/);
assert.throws(()=>validateIntakeNoticeCoverage({...published,effective_from:'2999-01-01T00:00:00.000Z'}),/todavía no está vigente/);
assert.throws(()=>validateIntakeNoticeCoverage({...published,simplified_notice:'Datos de cuenta y perro.'}),/no cubre preinscripciones/);
assert.throws(()=>validateIntakeNoticeCoverage({...published,integral_notice:'Datos de cuenta y perro.'}),/no cubre preinscripciones/);
assert.throws(()=>validateIntakeNoticeCoverage({...published,integral_notice:'Las preinscripciones son provisionales.'}),/no cubre preinscripciones/);
assert.throws(()=>validateIntakeNoticeCoverage({...published,integral_notice:''}),/carece de información legal/);
assert.equal((await assertIntakePublishedNotice()),published.id);
response={...published,simplified_notice:'No informa sobre familiares'};
await assert.rejects(assertIntakePublishedNotice(),/no cubre preinscripciones/);
assert.equal(requests,2,'Every contact write must re-fetch published status');

for(const [path,name] of [
  ['src/services/dog-preregistration.service.ts','adminPreregisterDogWithProgram'],
  ['src/services/dog-preregistration.service.ts','staffPreregisterDogWithProgram'],
  ['src/services/preregistration-family.service.ts','addAdminPreregisteredFamily'],
  ['src/services/preregistration-admin.service.ts','adminCompletePreregistrationContact'],
]){
  const code=fs.readFileSync(path,'utf8');
  const start=code.indexOf('export async function '+name+'(');
  assert.ok(start>=0,'Missing '+name);
  const end=code.indexOf('\nexport ',start+30);
  const chunk=code.slice(start,end<0?undefined:end);
  const gate=chunk.indexOf('await assertIntakePublishedNotice();');
  const rpc=chunk.indexOf('await rpc(')>=0?chunk.indexOf('await rpc('):
    chunk.indexOf('await callPreregistrationRpc(')>=0?chunk.indexOf('await callPreregistrationRpc('):
    chunk.indexOf('await supabase.rpc');
  assert.ok(gate>=0 && rpc>=0 && gate<rpc,
    name+' must verify live notice before the first write RPC');
}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')).scripts;
assert.equal(pkg['test:intake-published-notice'],'node scripts/test-intake-published-notice.mjs');
assert.ok(pkg.verify.includes('npm run test:intake-published-notice &&'));
console.log('UCAPSA intake published-notice gate PASS: admin, trainer, family and contact update, published scope, fail-closed, re-fetch');
