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
const summarySsotSql = fs.readFileSync('supabase/sql/ucapsa-payment-summary-ssot.sql', 'utf8');
const invariantsSql = fs.readFileSync('supabase/sql/ucapsa-payment-data-invariants.sql', 'utf8');
const adminPaymentsUi = fs.readFileSync('src/app/admin/customer-payments.tsx', 'utf8');
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
  'admin_register_payment',
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

for (const token of [
  'p_amount is null or p_amount <= 0',
  'La obligacion no pertenece al cliente o a la membresia indicada.',
  'El identificador idempotente ya fue usado con datos distintos.',
]) {
  if (!registerSql.includes(token)) {
    throw new Error('Idempotent payment registration invariant missing: ' + token);
  }
}


for (const token of [
  'create trigger trg_sync_obligation_membership_summary',
  'execute function public.sync_obligation_membership_summary_trigger()',
  'v_effective_membership_id uuid := p_membership_id',
  'v_effective_membership_id := v_obligation.membership_id',
  'v_existing.membership_id is distinct from v_effective_membership_id',
  'v_payment.membership_id is distinct from v_effective_membership_id',
  'revoke all on function public.sync_obligation_membership_summary_trigger()',
]) {
  if (!summarySsotSql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Payment summary SSOT contract missing: ' + token);
  }
}

if (!/after insert or delete or update of membership_id, amount, obligation_type, cancelled_at/i.test(summarySsotSql)) {
  throw new Error('Payment obligation summary trigger lost a balance-relevant mutation.');
}

for (const token of [
  'payments_amount_positive',
  'check (amount > 0)',
  'v_obligation_cancelled_at is not null',
  'No se puede vincular un pago a una obligacion cancelada.',
]) {
  if (!invariantsSql.includes(token)) {
    throw new Error('Payment data invariant missing: ' + token);
  }
}

if (/syncMembershipPaymentSummary|registerMembershipPayment/.test(admin)) {
  throw new Error('Payments admin service reintroduced client-side payment-summary synchronization or fake membership payment wrapper.');
}

if (/\.from\(['"]payments['"]\)[\s\S]{0,260}\.insert\s*\(/.test(admin)) {
  throw new Error('Payment registration bypassed admin_register_payment RPC.');
}

for (const token of [
  'createOfflineUuid',
  'registrationId',
  'paymentId: form.registrationId',
]) {
  if (!adminPaymentsUi.includes(token)) {
    throw new Error('Admin payment UI lost stable registration attempt identity: ' + token);
  }
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
