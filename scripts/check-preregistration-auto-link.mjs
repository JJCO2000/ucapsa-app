import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const raw=fs.readFileSync('scripts/lib/preregistration-match-policy.ts','utf8');
const js=ts.transpileModule(raw,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{exports:module.exports,module});
const decide=module.exports.decidePreregistrationLink;
assert.equal(typeof decide,'function');

const base={
  userId:'auth-1',emailKey:'cliente@ejemplo.mx',emailVerified:true,
  phoneE164:'+525512345678',phoneVerified:true,
  emailUniqueAcrossAuth:true,phoneUniqueAcrossAuth:true,
};
const person={
  id:'p1',emailKey:base.emailKey,phoneE164:base.phoneE164,
  linkedUserId:null,status:'pending',
};
const act=(a,people)=>decide({...base,...a},people);

assert.equal(act({},[person]).verifiedBy,'both');
assert.equal(act({emailVerified:false},[person]).verifiedBy,'phone');
assert.equal(act({phoneVerified:false},[person]).verifiedBy,'email');
assert.equal(act({phoneVerified:false,emailVerified:false},[person]).action,'no-match');
assert.equal(act({phoneE164:null,emailVerified:false},[person]).action,'no-match');
assert.equal(act({emailKey:null,phoneVerified:true},[person]).verifiedBy,'phone');
assert.equal(act({emailVerified:false,phoneVerified:true},[{...person,emailKey:null}]).verifiedBy,'phone');
assert.equal(act({phoneVerified:false,emailVerified:true},[{...person,phoneE164:null}]).verifiedBy,'email');
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
  {...person,emailKey:null},
  {...person,id:'p2',emailKey:null},
]).reason,'ambiguous');
assert.equal(act({emailVerified:false,phoneVerified:true},[
  {...person,emailKey:null,phoneE164:base.phoneE164},
]).verifiedBy,'phone');
assert.equal(act({phoneVerified:false,emailVerified:true},[
  {...person,phoneE164:null},
  {...person,id:'p2',emailKey:null,phoneE164:base.phoneE164},
]).verifiedBy,'email');
assert.equal(act({},[
  {...person,phoneE164:'+525511111111'},
  {...person,id:'p2',emailKey:'otro@ejemplo.mx'},
]).reason,'conflicting-contacts');
assert.equal(act({phoneUniqueAcrossAuth:false,emailVerified:false},[person]).action,'no-match');
assert.equal(act({phoneUniqueAcrossAuth:false},[person]).verifiedBy,'email');
assert.equal(act({emailUniqueAcrossAuth:false},[person]).verifiedBy,'phone');
assert.equal(act({phoneVerified:false,emailUniqueAcrossAuth:false},[person]).action,'no-match');

// Proteger una sola identidad Auth y contratos UI/SQL: jamás dar por
// verificado el teléfono guardado en public.profiles.
const phoneSql=fs.readFileSync('supabase/migrations/20261019193000_preregistration_verified_phone_or_email.sql','utf8');
const adminUi=fs.readFileSync('src/app/admin/preregister-dog.tsx','utf8');
const session=fs.readFileSync('src/hooks/useSession.tsx','utf8');
const verifyService=fs.readFileSync('src/services/phone-verification.service.ts','utf8');
const flag=fs.readFileSync('src/constants/preregistrationFeature.ts','utf8');
const accountSettings=fs.readFileSync('src/app/account-settings.tsx','utf8');
for(const [label,ok] of [
  ['SQL permite celular o correo',phoneSql.includes('if v_phone is null and v_email is null then')],
  ['SQL enlaza solamente contacto confirmado',phoneSql.includes('u.phone_confirmed_at is not null')],
  ['SQL busca celular',phoneSql.includes('p.phone_e164=v_phone')],
  ['Correo sigue como alternativa',phoneSql.includes('p.email_key=v_email')],
  ['Alta exige contacto',adminUi.includes('(!ownerPhone.trim() && !ownerEmail.trim())')],
  ['Sesión exige Auth verificado',session.includes('if (!phoneConfirmed && !emailConfirmed) return;')],
  ['OTP solo cuenta autenticada',verifyService.includes('current.user.id !== expectedUserId')],
  ['OTP no crea usuario nuevo',!verifyService.includes('signInWithOtp')],
  ['Confirmación OTP teléfono',verifyService.includes("type: 'phone_change'")],
  ['Después verifica Auth del servidor',verifyService.includes('after.user.phone !== phone')],
  ['SMS apagado sin autorización',flag.includes("EXPO_PUBLIC_UCAPSA_PHONE_OTP_ENABLED === 'true'")],
  ['Ajustes muestra verificación separada',accountSettings.includes('<PhoneVerificationCard user={user} />')],
]) {
  if(!ok)throw new Error('Regresión de celular verificado: '+label);
}
console.log('UCAPSA phone-first preregistration: 26 match cases and contract checks PASS');
