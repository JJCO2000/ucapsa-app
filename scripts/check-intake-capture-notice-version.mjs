import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/sql/ucapsa-intake-stamp-published-notice-version.sql','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
function check(source) {
  for(const needle of [
    'capture_notice_id uuid',
    'references public.privacy_notices(id) on delete restrict',
    'create or replace function ucapsa_intake.stamp_published_capture_notice()',
    "security definer\nset search_path = ''",
    "n.status = 'published'",
    'n.published_at is not null',
    'n.effective_from <= pg_catalog.clock_timestamp()',
    "pg_catalog.strpos(pg_catalog.lower(n.simplified_notice), 'preinscripci')",
    "pg_catalog.strpos(pg_catalog.lower(n.simplified_notice), 'familia')",
    "pg_catalog.strpos(pg_catalog.lower(n.integral_notice), 'preinscripci')",
    "pg_catalog.strpos(pg_catalog.lower(n.integral_notice), 'familia')",
    'new.capture_notice_id := v_notice_id',
    'trg_intake_notice_version_people',
    'trg_intake_notice_version_family',
    'before insert or update of owner_name, email_key, phone_e164',
    'before insert or update of full_name, email_key, phone_e164',
    'revoke all on function ucapsa_intake.stamp_published_capture_notice()',
  ]) assert.ok(source.includes(needle),'Missing version provenance guard '+needle);
  assert.ok(!source.includes('notice_delivery_attested = true') &&
    !source.includes('consent_granted = true'),
    'Stamping a version must not forge a delivery receipt or consent');
}
check(sql);
for(const altered of [
  sql.replace("n.status = 'published'",'1=1'),
  sql.replace('new.capture_notice_id := v_notice_id','new.capture_notice_id := null'),
  sql.replaceAll('trg_intake_notice_version_family','trg_intake_notice_version_missing'),
]) assert.throws(()=>check(altered),/Missing version provenance guard/);
assert.ok(pkg.scripts.verify.includes('npm run check:intake-capture-notice-version &&'));
assert.equal(pkg.scripts['check:intake-capture-notice-version'],
  'node scripts/check-intake-capture-notice-version.mjs');
console.log('UCAPSA intake notice version provenance checks PASS (no consent/receipt fabrication)');
