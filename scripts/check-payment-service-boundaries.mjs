import fs from 'node:fs';

const barrelPath = 'src/services/payments.service.ts';
const adminPath = 'src/services/payments-admin.service.ts';
const settingsPath = 'src/services/payment-settings.service.ts';
const readPath = 'src/services/payments-read.service.ts';
const registerSqlPath = 'supabase/sql/ucapsa-payment-register-idempotency.sql';

const barrel = fs.readFileSync(barrelPath, 'utf8');
const admin = fs.readFileSync(adminPath, 'utf8');
const settings = fs.readFileSync(settingsPath, 'utf8');
const read = fs.readFileSync(readPath, 'utf8');
const registerSql = fs.readFileSync(registerSqlPath, 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const line of [
  "export * from './payments-admin.service';",
  "export * from './payment-settings.service';",
  "export * from './payments-read.service';",
]) {
  if (!barrel.includes(line)) {
    throw new Error('Payments compatibility barrel lost export: ' + line);
  }
}

if (/\bsupabase\b|function\s+|type\s+[A-Za-z0-9_]+\s*=/.test(barrel)) {
  throw new Error('payments.service.ts must remain a compatibility barrel without implementation.');
}

for (const [name, text] of [
  ['admin', admin],
  ['settings', settings],
  ['read', read],
]) {
  if (/from ['"]\.\/payments\.service['"]/.test(text)) {
    throw new Error('Payments ' + name + ' module imports the compatibility barrel.');
  }
}

for (const token of [
  'getAdminPaymentAttentionRows',
  'registerCustomerPayment',
  'updateCustomerPayment',
  'voidCustomerPayment',
  'syncMembershipPaymentSummary',
]) {
  if (!admin.includes(token)) {
    throw new Error('Payments admin boundary lost operation: ' + token);
  }
}

for (const token of [
  'normalizeClabe',
  'isValidClabe',
  'isValidPaymentLink',
  'getPaymentSettings',
  'updatePaymentSettings',
]) {
  if (!settings.includes(token)) {
    throw new Error('Payment settings boundary lost operation: ' + token);
  }
}

if (!read.includes('getMyPaymentOverview')) {
  throw new Error('Payments read boundary lost getMyPaymentOverview.');
}

for (const token of [
  'create or replace function public.admin_register_payment',
  'p_payment_id uuid',
  'return v_existing',
  'refresh_membership_payment_summary',
  'create trigger trg_sync_payment_membership_summary',
  'execute function public.sync_payment_membership_summary_trigger()',
  'revoke all on function public.admin_register_payment',
]) {
  if (!registerSql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Idempotent payment registration contract missing: ' + token);
  }
}

if (!/if not public\.is_admin\(\)/i.test(registerSql)) {
  throw new Error('Idempotent payment registration RPC lost its Admin role barrier.');
}


if (/\.from\(['"]payment_settings['"]\)/.test(admin + read)) {
  throw new Error('Payment settings table leaked outside payment-settings.service.ts.');
}

if (/\.from\(['"]payments['"]\)|\.from\(['"]payment_obligations['"]\)|admin_void_payment/.test(settings)) {
  throw new Error('Payment settings module started owning transaction/history behavior.');
}

if (/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(/.test(read)) {
  throw new Error('Payments read service must remain read-only.');
}

for (const [name, text, maxLines] of [
  ['payments admin', admin, 330],
  ['payment settings', settings, 130],
  ['payments read', read, 180],
  ['payments barrel', barrel, 10],
]) {
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    throw new Error(name + ' grew beyond its responsibility boundary: ' + lines + ' > ' + maxLines + '.');
  }
}

if (!pkg.includes('"check:payment-service-boundaries"')) {
  throw new Error('npm verify does not include the payment service boundary guard.');
}

console.log('UCAPSA payment service boundaries: PASS');
