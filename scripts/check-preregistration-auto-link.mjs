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
assert.equal(act({emailVerified:false},[person]).verifiedBy,'phone');
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
]).reason,'ambiguous');
assert.equal(act({emailVerified:true,phoneVerified:false},[
  {...person,phoneE164:null},
  {...person,id:'p2',emailKey:null,phoneE164:base.phoneE164}
]).action,'link');
assert.equal(act({},[
  {...person,phoneE164:'+525511111111'},
  {...person,id:'p2',emailKey:'otro@ejemplo.mx'}
]).reason,'conflicting-contacts');
// Teléfono confirmado nunca sustituye un correo aún no verificado.
assert.equal(act({emailKey:null,emailVerified:false,phoneVerified:true},[person]).verifiedBy,'phone');
assert.equal(act({emailVerified:true,phoneVerified:false},[person]).verifiedBy,'email');
// Contract checks: the phone number may link only after Supabase Auth
// confirms ownership. Sending an SMS remains explicitly disabled by default.
const phoneSql = fs.readFileSync('supabase/migrations/20261019193000_verified_phone_preregistration_claim.sql','utf8');
const phoneFlag = fs.readFileSync('src/constants/phoneVerification.ts','utf8');
const phoneService = fs.readFileSync('src/services/phone-verification.service.ts','utf8');
const adminUi = fs.readFileSync('src/app/admin/preregister-dog.tsx','utf8');
const sessionHook = fs.readFileSync('src/hooks/useSession.tsx','utf8');
for (const [label,ok] of [
  ['Alta exige contacto',phoneSql.includes('if v_email is null and v_phone is null then')],
  ['Búsqueda por teléfono Auth',phoneSql.includes('v_phone is not null and p.phone_e164=v_phone')],
  ['No vincular sin contacto confirmado',phoneSql.includes('if v_phone is null and v_email is null then')],
  ['Telefono principal en formulario',adminUi.includes('Celular del tutor (principal)')],
  ['Sesión admite teléfono confirmado',sessionHook.includes('if (!phoneConfirmed && !emailConfirmed) return;')],
  ['SMS apagado hasta aprobación',phoneFlag.includes("EXPO_PUBLIC_UCAPSA_PHONE_OTP_ENABLED === 'true'")],
  ['Código Supabase phone_change',phoneService.includes("type: 'phone_change'")],
  ['Comprueba mismo usuario luego del OTP',phoneService.includes('after.data.user?.id !== expectedUserId')],
  ['Rechaza teléfono de verificación cruzada',phoneSql.includes('u.phone_change=v_phone')],
]) {
  if (!ok) throw new Error('Regresión de vinculación móvil: ' + label);
}

// Después de "Ahora no", el titular debe poder volver a revisar sin SMS,
// sin revelar teléfonos de expedientes ajenos y SIN vinculación automática.
const settings = fs.readFileSync('src/app/account-settings.tsx','utf8');
const consent = fs.readFileSync('src/components/domain/PreregistrationLinkPrompt.tsx','utf8');
const phoneView = fs.readFileSync('src/app/verify-phone.tsx','utf8');
for (const [label,passed] of [
  ['reapertura en sesión',sessionHook.includes('async function reviewPreregistrationLink()')],
  ['RPC solo de consulta',sessionHook.includes('const result = await previewMyPreregisteredDogs();')],
  ['consentimiento sigue separado',sessionHook.includes('async function confirmPreregistrationLink()')],
  ['reapertura usa usuario real',sessionHook.includes('profile?.user_id !== session.user.id')],
  ['opción visible desde Ajustes',settings.includes('Buscar mis preinscripciones')],
  ['navegación sin SMS',settings.includes('void checkMyPreregistrations()')],
  ['permite posponer',consent.includes('Ahora no')],
  ['no promete vínculo automático tras OTP',phoneView.includes('te preguntará si deseas vincularlos')],
]) {
  if (!passed) throw new Error('Regresión de consentimiento: ' + label);
}

console.log('UCAPSA auto-link policy: verified phone-first, email fallback; zero DB writes');
