import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20261021183000_private_ranking_photo_consent.sql','utf8');
const edge = fs.readFileSync('supabase/functions/dog-ranking-photo/index.ts','utf8');
const config = fs.readFileSync('supabase/config.toml','utf8');
const workflow = fs.readFileSync('.github/workflows/ucapsa-ranking-photo-db.yml','utf8');
for (const clause of [
  'ranking_photo_publication_approved boolean NOT NULL DEFAULT false',
  'ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.dog_ranking_photo_consents FROM PUBLIC, anon, authenticated',
  'REVOKE ALL ON public.dog_ranking_photo_consent_events FROM PUBLIC, anon, authenticated',
  'v_dog.user_id IS DISTINCT FROM v_user',
  'IF NOT p_enabled THEN',
  "version LIKE '1.4%'",
  "position('foto pública' IN lower(integral_notice))",
  "position('foto pública' IN lower(simplified_notice))",
  'AFTER UPDATE OF photo_path, user_id, is_active',
  'action IN (\'grant\', \'revoke\', \'photo_changed\')',
  'c.notice_version = (SELECT version FROM active_notice)',
]) assert.ok(sql.includes(clause), 'DB consent invariant missing: '+clause);
for(const clause of [
  "userClient.auth.getUser", // next clause below explicitly pins actual variable
]) {} // intentionally no extra import
for (const clause of [
  'authClient.auth.getUser(jwt)',
  "service.from('dog_ranking_photo_consents')",
  ".is('revoked_at', null)",
  "service.from('privacy_notices')",
  ".eq('status', 'published')",
  'publicationAllowed(notice.data, consent.notice_version)',
  "service.from('dogs').select('user_id,photo_path,is_active')",
  'consent.user_id !== dog.user_id',
  'authorizedSource()', // called twice to narrow revocation race
  'latest.path !== first.path',
  ".from('dog-photos').download(first.path, {",
  "transform: { width: 256, height: 256, resize: 'cover', quality: 70 }",
  'image.size > MAX_THUMBNAIL_BYTES',
  "'Cache-Control': 'private, no-store",
  'Access-Control-Allow-Origin',
  'new Response(image.stream()',
]) assert.ok(edge.includes(clause), 'Edge permission/thumbnail invariant missing: '+clause);
assert.ok((edge.match(/await authorizedSource\(\)/g)||[]).length===2,
  'Must check photo permission before and after transformation.');
for (const forbidden of ['createSignedUrl(', 'getPublicUrl(', '.download(first.path);',
  'service.storage.from(\'dog-photos\').download(dog.photo_path);']) {
  assert.ok(!edge.includes(forbidden), 'Never expose original/signed photo: '+forbidden);
}
assert.ok(config.includes('[functions.dog-ranking-photo]\nverify_jwt = true'),
  'Edge must require JWT at gateway.');
assert.ok(workflow.includes('postgres:16.4-alpine')
  && workflow.includes('ucapsa-ranking-photo-consent-e2e.sql'),
  'Real isolated DB test must be wired to CI.');
console.log('Ranking photo: current privacy notice, owner-only choice, private thumbnail, revoke guards PASS');
