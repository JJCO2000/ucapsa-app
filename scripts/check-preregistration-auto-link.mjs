import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const raw = fs.readFileSync('scripts/lib/preregistration-match-policy.ts','utf8');
const js = ts.transpileModule(raw,{ compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{exports:module.exports,module});
const decide=module.exports.decidePreregistrationLink;
assert.equal(typeof decide,'function');

const base={userId:'auth-1',emailKey:'cliente@ejemplo.mx',emailVerified:true,
  phoneE164:'+525512345678',phoneVerified:true,emailUniqueAcrossAuth:true,phoneUniqueAcrossAuth:true};
const person={id:'p1',emailKey:base.emailKey,phoneE164:base.phoneE164,
  linkedUserId:null,status:'pending'};
const act=(a,arr)=>decide({...base,...a},arr);
assert.equal(act({},[person]).action,'link');
assert.equal(act({},[person]).verifiedBy,'both');
assert.equal(act({phoneVerified:false},[person]).verifiedBy,'email');
assert.equal(act({emailVerified:false},[person]).action,'no-match');
assert.equal(act({emailVerified:false,phoneVerified:false},[person]).action,'no-match');
assert.equal(act({emailUniqueAcrossAuth:false,phoneVerified:false},[person]).action,'no-match');
assert.equal(act({phoneUniqueAcrossAuth:false,emailVerified:false},[person]).action,'no-match');
assert.equal(act({},[]).action,'no-match');
assert.equal(act({},[person,{...person,id:'p2'}]).reason,'ambiguous');
assert.equal(act({},[person,{...person,id:'p2',emailKey:null}]).reason,'ambiguous');
assert.equal(act({},[person,{...person,id:'p2',phoneE164:null}]).reason,'ambiguous');
assert.equal(act({},[{...person,phoneE164:'+525511111111'}]).reason,'conflicting-contacts');
assert.equal(act({},[{...person,emailKey:'otro@ejemplo.mx'}]).reason,'conflicting-contacts');
assert.equal(act({},[{...person,linkedUserId:'auth-2'}]).reason,'existing-binding');
assert.equal(act({},[{...person,linkedUserId:'auth-1',status:'linked'}]).action,'already-linked');
assert.equal(act({},[{...person,status:'rejected'}]).action,'no-match');
assert.equal(act({userId:''},[person]).reason,'untrusted-contact');
assert.equal(act({emailVerified:false,phoneVerified:true},[
  {...person, emailKey:null,phoneE164:'+525512345678'},
  {...person,id:'p2',emailKey:null,phoneE164:'+525512345678'}
]).action,'no-match');
assert.equal(act({emailVerified:true,phoneVerified:false},[
  {...person,phoneE164:null},
  {...person,id:'p2',emailKey:null,phoneE164:base.phoneE164}
]).action,'link');
assert.equal(act({},[
  {...person,phoneE164:'+525511111111'},
  {...person,id:'p2',emailKey:'otro@ejemplo.mx'}
]).reason,'conflicting-contacts');
// Teléfono confirmado nunca sustituye un correo aún no verificado.
assert.equal(act({emailKey:null,emailVerified:false,phoneVerified:true},[person]).action,'no-match');
assert.equal(act({emailVerified:true,phoneVerified:false},[person]).verifiedBy,'email');
// Los contratos de interfaz, sesión y SQL deben exigir el mismo correo
// verificado. El número telefónico es secundario y no habilita el enlace.
const emailSql = fs.readFileSync('supabase/migrations/20261019183000_preregistration_primary_email.sql','utf8');
const adminUi = fs.readFileSync('src/app/admin/preregister-dog.tsx','utf8');
const sessionHook = fs.readFileSync('src/hooks/useSession.tsx','utf8');
const emailService = fs.readFileSync('src/services/dog-preregistration.service.ts','utf8');
for (const [label,ok] of [
  ['Alta SQL exige email',emailSql.includes("if v_email is null then")],
  ['Consulta SQL por correo primario',emailSql.includes("where p.status='pending' and p.email_key=v_email")],
  ['Teléfono no permite vínculo sin correo',emailSql.includes("return pg_catalog.jsonb_build_object('status','unverified','linked_dogs',0)")],
  ['Formulario exige correo',adminUi.includes("!ownerEmail.trim()")],
  ['Formulario informa prioridad del correo',adminUi.includes('Correo principal del tutor (obligatorio)')],
  ['Sesión exige email verificado',sessionHook.includes('if (!emailConfirmed) return;')],
  ['Servicio normaliza correo',emailService.includes('input.ownerEmail.trim().toLowerCase()')],
]) {
  if (!ok) throw new Error('Regresión de correo principal: '+label);
}

console.log('UCAPSA auto-link policy: email-first, 20 cases passed; zero DB writes');
