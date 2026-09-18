import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-privacy-notice-foundation.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

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

if (!pkg.includes('"check:privacy-notice"')) {
  throw new Error('npm verify does not include the privacy notice guard.');
}

console.log('UCAPSA privacy notice SSOT foundation: PASS');
