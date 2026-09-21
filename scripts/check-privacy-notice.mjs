import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-privacy-notice-foundation.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const service = fs.readFileSync('src/services/privacy-notice.service.ts', 'utf8');
const publicScreen = fs.readFileSync('src/app/privacy.tsx', 'utf8');
const adminList = fs.readFileSync('src/app/admin/privacy-notices.tsx', 'utf8');
const adminForm = fs.readFileSync('src/app/admin/privacy-notice-form.tsx', 'utf8');
const adminTools = fs.readFileSync('src/app/admin/tools-administration.tsx', 'utf8');
const register = fs.readFileSync('src/app/auth/register.tsx', 'utf8');
const accountSettings = fs.readFileSync('src/app/account-settings.tsx', 'utf8');

const required = [
  'create table if not exists public.privacy_notices',
  "check (status in ('draft', 'published', 'retired'))",
  'privacy_notices_one_published_idx',
  'create policy "Read published privacy notice or superadmin"',
  'create or replace function public.admin_save_privacy_notice',
  'create or replace function public.admin_publish_privacy_notice',
  "raise exception 'El aviso esta incompleto y no puede publicarse.'",
  'responsible_name',
  'responsible_address',
  'data_categories',
  'sensitive_data_categories',
  'purposes',
  'consent_required_purposes',
  'limitation_mechanisms',
  'arco_procedure',
  'change_notice_method',
  'transfer_clause',
  'simplified_notice',
  'integral_notice',
];

for (const token of required) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Privacy notice SSOT contract missing: ' + token);
  }
}

if (/insert\s+into\s+public\.privacy_notices[\s\S]{0,2000}values\s*\([\s\S]{0,400}'published'/i.test(sql)) {
  throw new Error('Privacy migration must not invent and auto-publish a legal notice.');
}

for (const [name, text, token] of [
  ['privacy service', service, 'getPublishedPrivacyNotice'],
  ['privacy service', service, 'admin_publish_privacy_notice'],
  ['public privacy screen', publicScreen, 'getPublishedPrivacyNotice'],
  ['admin notice list', adminList, 'getPrivacyNoticesAdmin'],
  ['admin notice form', adminForm, 'savePrivacyNoticeDraft'],
  ['admin notice form', adminForm, 'publishPrivacyNotice'],
  ['admin tools', adminTools, '/admin/privacy-notices'],
]) {
  if (!text.includes(token)) {
    throw new Error(name + ' is not wired to the privacy notice SSOT: ' + token);
  }
}

if (!/role === ['"]super_admin['"]/.test(adminList) || !/Redirect/.test(adminList)) {
  throw new Error('Privacy notice list is no longer Superadmin-only.');
}

if (!/role === ['"]super_admin['"]/.test(adminForm) || !/Redirect/.test(adminForm)) {
  throw new Error('Privacy notice form is no longer Superadmin-only.');
}

if (/responsibleName:\s*['"][^'"]+['"]/.test(adminForm) || /responsibleAddress:\s*['"][^'"]+['"]/.test(adminForm)) {
  throw new Error('Privacy form started hardcoding legal identity or address.');
}

for (const token of [
  'getPublishedPrivacyNotice',
  'privacyNotice.simplified_notice',
  'href="/privacy"',
  'disabled={loading}',
]) {
  if (!register.includes(token)) {
    throw new Error('Registration no longer preserves the optional published privacy notice UI: ' + token);
  }
}

if (/disabled=\{loading\s*\|\|\s*!privacyNotice\}/.test(register) || /if\s*\(\s*!privacyNotice\s*\)/.test(register)) {
  throw new Error('Testing registration must not be blocked by a missing published privacy notice.');
}

if (!accountSettings.includes("router.push('/privacy' as never)")) {
  throw new Error('Account settings lost the canonical privacy notice entry.');
}

if (!pkg.includes('"check:privacy-notice"')) {
  throw new Error('npm verify does not include the privacy notice guard.');
}

console.log('UCAPSA privacy notice SSOT + UI: PASS');
