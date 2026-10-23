import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20261023160000_family_accounts_mutual_consent.sql','utf8');
const svc = fs.readFileSync('src/services/family-account-links.service.ts','utf8');
const client = fs.readFileSync('src/app/client/family.tsx','utf8');
const admin = fs.readFileSync('src/app/admin/preregistration.tsx','utf8');
const profile = fs.readFileSync('src/app/(tabs)/profile.tsx','utf8');
const e2e = fs.readFileSync('scripts/isolated-db/ucapsa-family-account-links-e2e.sql','utf8');

for (const fragment of [
  'CREATE TABLE IF NOT EXISTS ucapsa_intake.family_account_links',
  'family_member_id uuid NOT NULL UNIQUE',
  'head_user_id uuid NOT NULL',
  'relative_user_id uuid NOT NULL',
  'ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON ucapsa_intake.family_account_links FROM PUBLIC, anon, authenticated',
  'auth.uid() IS NULL OR NOT public.is_ucapsa_admin()',
  'CREATE OR REPLACE FUNCTION public.admin_preview_family_account',
  'CREATE OR REPLACE FUNCTION public.admin_authorize_family_account',
  'CREATE OR REPLACE FUNCTION public.get_my_family_account_links',
  'CREATE OR REPLACE FUNCTION public.set_my_family_progress_consent',
  'CREATE OR REPLACE FUNCTION public.get_my_family_progress',
  'CREATE OR REPLACE FUNCTION public.admin_revoke_family_account',
  'p.linked_user_id=l.head_user_id',
  'head_consented_at IS NOT NULL AND l.relative_consented_at IS NOT NULL',
  'ON ucapsa_intake.family_account_links',
  'admin_audit_logs',
  'head_notice_version text',
  'relative_notice_version text',
  'ucapsa_intake.current_family_progress_notice_version()',
  "position('progreso familiar' IN lower(coalesce(p.integral_notice,'')))",
  "position('revocar' IN lower(coalesce(p.integral_notice,'')))",
  'l.head_notice_version=n.version AND l.relative_notice_version=n.version',
  'head_notice_version=CASE WHEN p_accept THEN v_notice_version ELSE NULL END',
  'relative_notice_version=CASE WHEN p_accept THEN v_notice_version ELSE NULL END',
]) assert.ok(sql.includes(fragment),'Missing DB protection: '+fragment);

assert.ok(sql.includes('l.head_consented_at IS NOT NULL AND l.relative_consented_at IS NOT NULL'),
  'Mutual explicit consent is required to read progress.');
assert.ok(sql.includes("l.revoked_at IS NULL")
  && sql.includes("relative_consented_at=CASE WHEN p_accept")
  && sql.includes("head_consented_at=CASE WHEN p_accept"),
  'Either account must withdraw access.');
assert.ok(!/insert into\s+(public\.)?(dogs|memberships|payment|profiles)/i.test(sql),
  'Family cannot change ownership, membership or payments.');
assert.ok(/public\.dogs d ON d\.user_id=a\.partner_id/.test(sql)
  && /e\.user_id=a\.partner_id AND e\.dog_id=d\.id/.test(sql),
  'Progress cannot read arbitrary dog or enrollment IDs.');
for (const forbidden of ['email_key AS', 'phone_e164 AS', 'payment_amount',
  'photo_path AS','update public.dogs','UPDATE public.program_enrollments']) {
  assert.ok(!sql.includes(forbidden), 'Read-only boundary breached: '+forbidden);
}
assert.ok(client.includes("router.push('/privacy' as never)")
  && client.includes('tendrás')
  && client.includes('volver a autorizarlo'),
  'Consent view must explain notice renewal and offer actual privacy notice.');
assert.ok(client.includes('loadedForUserId !== user.id')
  && client.includes('requestId !== requestIdRef.current')
  && client.includes('setLinks([])')
  && client.includes('setProgress([])'),
  'Do not show prior account data or accept stale async family results.');
assert.ok(client.includes('Autorizar compartir progreso')
  && client.includes('Dejar de compartir')
  && client.includes('No se comparten pagos')
  && client.includes('getMyFamilyProgress()'),
  'Client must show optional, revocable read-only progress.');
assert.ok(profile.includes("router.push('/client/family' as never)"),
  'Profile must link to accessible family screen.');
assert.ok(admin.includes('previewAdminFamilyAccount')
  && admin.includes('authorizeAdminFamilyAccount')
  && admin.includes('revokeAdminFamilyAccount')
  && admin.includes('Comprobación presencial'),
  'Admin must review, authorize and revoke with evidence.');
assert.ok(svc.includes("'admin_preview_family_account'")
  && svc.includes("'set_my_family_progress_consent'")
  && svc.includes("'get_my_family_progress'"),
  'App must use official RPC for family links, not directly access private tables.');
for (const name of ['reject_old_notice','invalidate_old_consent','no_partial_renewal',
  'client_denied','no_claim','head_approval','relative_approval',
  'read_relative','read_head','stranger','withdrawn','final']) {
  assert.ok(e2e.includes(name), 'Missing test case: '+name);
}
assert.ok(!sql.includes('CREATE OR REPLACE FUNCTION ucapsa_intake.append_family_for_dog'),
  'Never overwrite the already corrected family capture helper from main.');
console.log('UCAPSA family mutual account relationship and read-only consent contract PASS');
