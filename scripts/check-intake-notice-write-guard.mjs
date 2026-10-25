import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/sql/ucapsa-intake-notice-capture-guard.sql','utf8');
const pkg=fs.readFileSync('package.json','utf8');
const normalize=(value)=>value.toLowerCase().replace(/\s+/g,' ').trim();

function check(source) {
  const s=normalize(source);
  for(const needle of [
    'create table if not exists ucapsa_intake.approved_capture_notices',
    'notice_id uuid primary key references public.privacy_notices(id)',
    'alter table ucapsa_intake.approved_capture_notices enable row level security',
    'revoke all on ucapsa_intake.approved_capture_notices from public, anon, authenticated, service_role',
    'add column if not exists capture_notice_id uuid references public.privacy_notices(id)',
    'add column if not exists notice_delivery_attested boolean not null default false',
    'add column if not exists notice_delivery_reported_by uuid references auth.users(id)',
    'add column if not exists notice_delivery_recorded_at timestamptz',
    'create or replace function ucapsa_intake.enforce_contact_notice_capture()',
    'security definer set search_path =',
    "if v_actor is null or not public.is_ucapsa_staff() then",
    'new.notice_delivery_attested is distinct from true',
    'new.notice_delivery_reported_by is distinct from v_actor',
    'new.capture_notice_id is null',
    "new.notice_delivery_method not in ('presencial', 'correo_entregado', 'otro_documentado')",
    'join ucapsa_intake.approved_capture_notices a on a.notice_id=n.id',
    "and n.status='published'",
    'and n.published_at is not null',
    'and (n.effective_from is null or n.effective_from <= pg_catalog.now())',
    'new.notice_delivery_recorded_at := pg_catalog.clock_timestamp()',
    'new.notice_delivery_recorded_at is not null then',
    'if tg_op =',
    'and new.notice_delivery_recorded_at is not null',
    'create trigger trg_capture_notice_people',
    'create trigger trg_capture_notice_family',
    'before insert or update of owner_name, email_key, phone_e164',
    'before insert or update of full_name, email_key, phone_e164',
  ]) {
    assert.ok(s.includes(needle),'Missing server-side contact guard: '+needle);
  }
  const triggerDefinitions = source.match(/create trigger trg_capture_notice_(?:people|family)[\s\S]*?;/gi) ?? [];
  assert.equal(triggerDefinitions.length,2);
  for (const statement of triggerDefinitions) {
    assert.doesNotMatch(statement,/notice_delivery_reported_by/i,
      'Do not block Auth FK ON DELETE SET NULL for notice reporters.');
  }
  assert.ok(s.includes('new.notice_delivery_recorded_at := pg_catalog.clock_timestamp()'));
  assert.ok(!s.includes('new.notice_delivery_recorded_at is not distinct from old.notice_delivery_recorded_at'),
    'An UPDATE must clear its receipt so that only the trigger generates the new timestamp.');
  assert.doesNotMatch(source,/insert\s+into\s+ucapsa_intake\.approved_capture_notices/i,
    'The draft must not auto-approve unpublished/unreviewed versions.');
  assert.doesNotMatch(source,/\b(grant\s+(insert|all)\s+on\s+ucapsa_intake\.approved_capture_notices)/i,
    'No client or service_role may auto-authorize a legal version.');
}
check(sql);
// Quality gate must reject changes which remove a layer of defense.
for(const token of [
  "and n.status='published'",
  'new.notice_delivery_attested is distinct from true',
  "create trigger trg_capture_notice_family",
  'new.notice_delivery_reported_by is distinct from v_actor',
]) {
  assert.throws(()=>check(sql.replace(token,'')),/Missing server-side contact guard/,
    'Removing '+token+' must break the guard');
}
assert.ok(pkg.includes('"check:intake-notice-write-guard"'));
assert.ok(pkg.includes('npm run check:intake-notice-write-guard &&'));

// This intentionally makes all new/changed intake contacts fail until a
// reviewed notice is approved AND RPCs/UX transmit individual attestations.
const rpc=fs.readFileSync('src/services/dog-preregistration.service.ts','utf8');
assert.ok(!rpc.includes('p_notice_delivery_attested'),
  'Update this release gate when integration with the new RPC contract is implemented.');
console.log('UCAPSA intake privacy guard (draft): people/family triggers, explicit reviewed notice, staff attestation, server timestamp, negative mutation checks PASS');
