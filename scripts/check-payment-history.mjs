import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-payment-void-foundation.sql', 'utf8');
const workflow = fs.readFileSync('supabase/sql/ucapsa-payment-void-workflow.sql', 'utf8');
const paymentLinkHardening = fs.readFileSync('supabase/sql/ucapsa-payment-link-https-hardening.sql', 'utf8');
const adminService = fs.readFileSync('src/services/payments-admin.service.ts', 'utf8');
const settingsService = fs.readFileSync('src/services/payment-settings.service.ts', 'utf8');
const adminUi = fs.readFileSync('src/app/admin/customer-payments.tsx', 'utf8');
const transferUi = fs.readFileSync('src/app/client/payment-transfer.tsx', 'utf8');
const paymentsTab = fs.readFileSync('src/app/(tabs)/payments.tsx', 'utf8');
const paymentSettingsUi = fs.readFileSync('src/app/admin/payment-settings.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of ['voided_at timestamptz', 'voided_by uuid', 'void_reason text']) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Payment void foundation missing: ' + token);
  }
}

if (/delete\s+from\s+public\.payments/i.test(sql)) {
  throw new Error('Payment void foundation must not delete historical payment rows.');
}


for (const token of [
  'create or replace function public.admin_void_payment',
  'payments_void_integrity_guard',
  "drop policy if exists \"payments_admin_delete_v2\"",
  'revoke delete on table public.payments from authenticated',
  "set_config('ucapsa.payment_void_context', 'admin_void_payment', true)",
]) {
  if (!workflow.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Payment void workflow missing: ' + token);
  }
}

if (/delete\s+from\s+public\.payments/i.test(workflow)) {
  throw new Error('Canonical payment void workflow must not physically delete payment rows.');
}

for (const token of [
  "supabase.rpc('admin_void_payment'",
  "is('voided_at', null)",
  'voidCustomerPayment',
]) {
  if (!adminService.includes(token)) {
    throw new Error('Payment admin service void contract missing: ' + token);
  }
}

if (/\.from\(['"]payments['"]\)\.delete\(\)/.test(adminService) || /deleteCustomerPayment|deleteMembershipPayment/.test(adminService)) {
  throw new Error('Payment service returned to physical deletion.');
}

for (const token of [
  'isValidPaymentLink',
  "url.protocol === 'https:'",
  'El enlace de pago debe usar HTTPS',
]) {
  if (!settingsService.includes(token)) {
    throw new Error('Payment link transport hardening missing: ' + token);
  }
}

for (const token of [
  'payment_settings_clip_url_https_check',
  "btrim(clip_url) ~* '^https://'",
]) {
  if (!paymentLinkHardening.includes(token)) {
    throw new Error('Payment link database hardening missing: ' + token);
  }
}

if (!transferUi.includes('isValidPaymentLink(settings.clip_url)') || !transferUi.includes('Linking.openURL(paymentLink)')) {
  throw new Error('Client payment transfer must validate the persisted link again before opening it.');
}

if (/Linking\.openURL\(settings\.clip_url/.test(transferUi)) {
  throw new Error('Client payment transfer must not open raw persisted payment URLs.');
}

for (const token of [
  'Titular / beneficiario',
  'accountHolder',
  'row?.account_holder',
]) {
  if (!paymentSettingsUi.includes(token)) {
    throw new Error('Admin payment settings lost account-holder SSOT wiring: ' + token);
  }
}

for (const token of [
  '>TITULAR<',
  'bankSettings.account_holder',
  ".replace(/\\s+/g, ' ').trim()",
  'copyAccountHolder',
  'Copiar titular de la cuenta UCAPSA',
]) {
  if (!paymentsTab.includes(token)) {
    throw new Error('Client Payments separate account-holder block lost its SSOT/copy wiring: ' + token);
  }
}

if (/Titular:\s*\{bankSettings\.account_holder/.test(paymentsTab)) {
  throw new Error('Client Payments merged the account holder back into the CLABE row.');
}

if (!transferUi.includes('label="Titular"') || !transferUi.includes('settings?.account_holder')) {
  throw new Error('Client transfer screen lost the live account holder.');
}

for (const token of ['Anular pago', 'voidReason', 'void_reason', 'Histórico']) {
  if (!adminUi.includes(token)) {
    throw new Error('Admin payment history lost traced void UI: ' + token);
  }
}

if (/Eliminar pago/.test(adminUi)) {
  throw new Error('Admin UI returned to destructive payment deletion language.');
}

if (!pkg.includes('"check:payment-history"')) {
  throw new Error('npm verify does not include the payment-history guard.');
}

console.log('UCAPSA payment void workflow + effective balances + UI: PASS');
