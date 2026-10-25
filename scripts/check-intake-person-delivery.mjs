import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/sql/ucapsa-intake-per-person-notice-delivery.sql','utf8');
const dog=fs.readFileSync('src/services/dog-preregistration.service.ts','utf8');
const family=fs.readFileSync('src/services/preregistration-family.service.ts','utf8');
const admin=fs.readFileSync('src/services/preregistration-admin.service.ts','utf8');
const adminUI=fs.readFileSync('src/app/admin/preregister-dog.tsx','utf8');
const staffUI=fs.readFileSync('src/app/staff/preregister-dog.tsx','utf8');
const familyUI=fs.readFileSync('src/components/domain/PreregistrationFamilyEditor.tsx','utf8');
const recordUI=fs.readFileSync('src/app/admin/preregistration.tsx','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')).scripts;

function auditSql(text) {
  for(const required of [
    'notice_delivery_attested boolean not null default false',
    'notice_delivery_reported_by uuid references auth.users(id) on delete set null',
    'notice_delivery_recorded_at timestamptz',
    'ucapsa_intake.record_notice_delivery_for_dog',
    "if v_actor is null or not public.is_ucapsa_staff() then",
    "n.status='published'",
    "p_owner_method not in ('presencial','correo_entregado','otro_documentado')",
    "v_method not in ('presencial','correo_entregado','otro_documentado')",
    'capture_notice_id=v_notice_id',
    'notice_delivery_recorded_at=pg_catalog.clock_timestamp()',
    'if v_updated<>1 then',
    'create or replace function public.admin_preregister_dog_with_notice',
    'create or replace function public.staff_preregister_dog_with_notice',
    'create or replace function public.admin_add_preregistered_family_with_notice',
    'create or replace function public.admin_complete_preregistration_contact_with_notice',
    'perform ucapsa_intake.record_notice_delivery_for_dog(v_dog,p_owner_method,p_family_members)',
    'grant execute on function public.staff_preregister_dog_with_notice',
    'grant execute on function public.admin_preregister_dog_with_notice',
  ])assert.ok(text.includes(required),'Missing required privacy security boundary: '+required);
  assert.ok(!text.includes('consent_granted=true'),'Cannot invent actual consent');
}
auditSql(migration);
for(const needle of ["if v_actor is null or not public.is_ucapsa_staff() then","capture_notice_id=v_notice_id","if v_updated<>1 then"]){
  assert.throws(()=>auditSql(migration.replaceAll(needle,'')),/Missing required privacy security boundary/);
}
for(const [code,name] of [[dog,'admin_preregister_dog_with_notice'],[dog,'staff_preregister_dog_with_notice'],[family,'admin_add_preregistered_family_with_notice'],[admin,'admin_complete_preregistration_contact_with_notice']]){
  assert.ok(code.includes(name),'Client must use atomic backend wrapper '+name);
}
for(const code of [adminUI,staffUI,recordUI]){
  assert.ok(code.includes('NoticeDeliverySelector'),'Each owner/contact edit form must show delivery attestation');
}
assert.ok(familyUI.includes('NoticeDeliverySelector') && familyUI.includes('member.noticeDeliveryMethod'));
assert.ok(dog.includes('prepareFamilyNoticeDeliveries'));
assert.ok(family.includes('requireNoticeDeliveryMethod'));
assert.equal(pkg['check:intake-person-delivery'],'node scripts/check-intake-person-delivery.mjs');
assert.ok(pkg.verify.includes('npm run check:intake-person-delivery &&'));
console.log('UCAPSA personal privacy notice attestation: contract, UI, RPC, actor, server timestamp, negative mutation PASS');
