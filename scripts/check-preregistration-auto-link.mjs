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
  ['Sesión revisa vínculos con seguridad',sessionHook.includes('claimMyFirstPreregisteredDogs()')],
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
  ['explica primer vínculo tras OTP',phoneView.includes('lo vinculará automáticamente')],
]) {
  if (!passed) throw new Error('Regresión de consentimiento: ' + label);
}

console.log('UCAPSA auto-link policy: verified phone-first, email fallback; zero DB writes');


// Admin-approved alternative: no OTP/SMS and no editable profile field
// confers ownership. A server-side Admin authorizes ONE specific Auth user.
const manualSql = fs.readFileSync(
  'supabase/migrations/20261019233000_admin_approved_preregistration_owner_link.sql','utf8');
const manualService = fs.readFileSync('src/services/dog-preregistration.service.ts','utf8');
for (const [label,ok] of [
  ['approvals private and RLS protected',manualSql.includes('owner_link_approvals enable row level security')],
  ['only Admin may approve',manualSql.includes("auth.uid() is null or not public.is_ucapsa_admin()")],
  ['approval is account-scoped',manualSql.includes('where a.user_id=v_user and a.consumed_at is null')],
  ['unverified never automatically linked',manualSql.includes('and not v_manual then')],
  ['explicit consent remains',sessionHook.includes('async function confirmPreregistrationLink()')],
  ['manual entry in profile',settings.includes('preregistrationEnabled && !isOfflineFallback ? (')],
  ['Admin confirms person and account',adminUi.includes('Confirmar vinculación asistida')],
  ['admin preview typed service',manualService.includes('adminPreviewPreregistrationOwnerLink')],
  ['admin approval typed service',manualService.includes('adminApprovePreregistrationOwnerLink')],
  ['audit traces approval',manualSql.includes('dog_preregistration.manual_approval')],
  ['preserve pre-existing verified contact route',manualSql.includes("else 'verified_contact' end")],
  ['manual SQL integration test exists',fs.existsSync('scripts/isolated-db/ucapsa-admin-approved-link-e2e.sql')],
]) {
 if (!ok) throw new Error('Manual owner-link regression: '+label);
}
console.log('UCAPSA admin-approved no-OTP link policy: Admin verifies offline, user consents.');


// First safe match is auto-linked, but the second can never bypass a specific
// Admin approval and user consent; never trust manually entered contact data.
const firstSql = fs.readFileSync(
  'supabase/migrations/20261019235000_first_trusted_auto_prereg_link.sql','utf8');
for (const [label,ok] of [
  ['first auto RPC checks first-ever link',firstSql.includes('claim_my_first_preregistered_dogs()')],
  ['first RPC locks user before checking',firstSql.includes("'ucapsa-claim:'||v_user::text")],
  ['second link requires Admin approval',firstSql.includes('if not v_manual and exists')],
  ['preview decides auto on first only',firstSql.includes("'auto_first',not exists")],
  ['subsequent link still asks permission',sessionHook.includes('setPreregistrationLinkOffer({ userId, count: result.count })')],
  ['first link clears cache',sessionHook.includes('clearClientReadCache(userId), clearHomeCache(userId)')],
  ['first link uses server-check',manualService.includes("claim_my_first_preregistered_dogs")],
  ['SMS remains opt in only',phoneFlag.includes("EXPO_PUBLIC_UCAPSA_PHONE_OTP_ENABLED === 'true'")],
  ['integration tests for second attempt',fs.existsSync('scripts/isolated-db/ucapsa-first-auto-link-e2e.sql')],
]) {
 if (!ok) throw new Error('First-auto/second-consent regression: '+label);
}
console.log('UCAPSA secure initial auto-link and repeat authorization: PASS');


// MVP typed email matches only for first unclaimed preregistration.
const mvpSql = fs.readFileSync('supabase/migrations/20261020040444_mvp_unverified_contact_email_first_claim.sql', 'utf8');
const mvpProfile = fs.readFileSync('src/services/profiles.service.ts', 'utf8');
const mvpSettings = fs.readFileSync('src/app/account-settings.tsx', 'utf8');
for (const [label, passed] of [
  ['separate contact-email column', mvpSql.includes('add column if not exists preregistration_contact_email text')],
  ['only first claim uses profile contacts', mvpSql.includes('if not v_manual and not exists')],
  ['both server RPCs accept manually entered contact email',
    (mvpSql.match(/p\.preregistration_contact_email/g) ?? []).length >= 2],
  ['typed contact email takes priority over unrelated login email',
    (mvpSql.match(/v_email := coalesce\(v_first_email,v_email\)/g) ?? []).length === 2],
  ['first claim reserves the unverified contact',
    mvpSql.includes('v_first_email is distinct from v_email')],
  ['profile persistence for typed email', mvpProfile.includes('payload.preregistration_contact_email')],
  ['screen saves typed email', mvpSettings.includes('preregistration_contact_email: normalizedContactEmail')],
  ['phone-only accounts can skip login email', mvpSettings.includes('Boolean(normalizedEmail) && normalizedEmail !== currentAuthEmail')],
  ['screen labels typed email as not verified', mvpSettings.includes('En este MVP no se verifica su titularidad')],
  ['session rechecks a changed contact email', sessionHook.includes('profile?.preregistration_contact_email')],
  ['repeat approval and consent retained', firstSql.includes('if not v_manual and exists')],
]) assert.ok(passed, 'MVP first-email matching regression: '+label);
console.log('UCAPSA first-claim profile-contact email MVP contract: PASS');


// Admin can only append missing contact to a pending provisional record.
// Never update linked owners, official programs, attendances, memberships or Auth.
const completeSql = fs.readFileSync(
  'supabase/migrations/20261020045901_admin_complete_preregistration_contact.sql', 'utf8');
const directoryUi = fs.readFileSync('src/app/admin/preregistration.tsx', 'utf8');
const directoryService = fs.readFileSync('src/services/preregistration-admin.service.ts', 'utf8');
for (const [label, passed] of [
  ['Admin role checked server-side', completeSql.includes('not public.is_ucapsa_admin()')],
  ['Pending-only update', completeSql.includes("v_person.status <> 'pending'")],
  ['Linked owner cannot be modified', completeSql.includes('v_person.linked_user_id is not null')],
  ['Prevents overwrite of stored contacts', completeSql.includes('v_person.email_key is not null')
    && completeSql.includes('v_person.phone_e164 is not null')],
  ['Rejects duplicate contact across provisional records', completeSql.includes('p.id <> v_person.id')],
  ['Rejects already-claimed contact', completeSql.includes('ucapsa_intake.claimed_contacts')],
  ['Atomic audit', completeSql.includes("'preregistration.contact_completed'")],
  ['No writes to program or attendance tables', !/\b(update|insert into|delete from)\s+(public\.(dogs|programs|memberships)|ucapsa_intake\.(dogs|programs|attendance_evidence))/i.test(completeSql)],
  ['Client uses authenticated Admin RPC', directoryService.includes("rpc('admin_complete_preregistration_contact'")],
  ['UI exposes action on pending contacts only', directoryUi.includes("record.status === 'pending' && (!record.ownerEmail || !record.ownerPhone)")],
  ['UI only submits currently missing fields', directoryUi.includes("record.ownerEmail ? '' : newEmail")],
  ['UI refreshes after saving', directoryUi.includes('await adminCompletePreregistrationContact(')
    && directoryUi.includes('await load();')],
]) assert.ok(passed, 'Admin contact completion regression: ' + label);
console.log('UCAPSA guarded admin contact completion contract: PASS');
