import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('supabase/migrations/20261021183000_private_ranking_photo_consent.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/dog-ranking-photo/index.ts', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');

for (const guard of [
  'ENABLE ROW LEVEL SECURITY', 'REVOKE ALL ON public.dog_ranking_photo_consents',
  'v_dog.user_id IS DISTINCT FROM v_user',
  "version LIKE '1.4%'", "position('foto pública' IN lower(integral_notice))",
  'v_dog.photo_path IS NULL', 'REVOKE ALL ON FUNCTION public.set_my_dog_ranking_photo_consent',
  "action IN ('grant', 'revoke', 'photo_changed')",
  'AFTER UPDATE OF photo_path, user_id, is_active',
  'updated_at = now()', "IF NOT p_enabled THEN",
]) assert.ok(migration.includes(guard), 'Falta guardia en consentimiento: ' + guard);

for (const guard of [
  "userClient.auth.getUser(token)", ".from('dog_ranking_photo_consents')",
  ".is('revoked_at', null)", ".from('dogs')", "dog.user_id !== consent.user_id",
  ".from('dog-photos').download(dog.photo_path)", "no-store",
  'Origin', "req.method !== 'GET'", 'X-Content-Type-Options',
]) assert.ok(edge.includes(guard), 'Falta guardia en imagen: ' + guard);

assert.ok(config.includes('[functions.dog-ranking-photo]\nverify_jwt = true'));
assert.ok(!edge.includes('createSignedUrl('), 'No generar URL firmada sin revocación.');
assert.ok(!migration.includes('GRANT UPDATE ON public.dog_ranking_photo_consents TO authenticated'));
console.log('Ranking fotos: consentimiento revocable y entrega protegida PASS');
