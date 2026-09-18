import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-payment-void-foundation.sql', 'utf8');
const workflow = fs.readFileSync('supabase/sql/ucapsa-payment-void-workflow.sql', 'utf8');
const service = fs.readFileSync('src/services/payments.service.ts', 'utf8');
const adminUi = fs.readFileSync('src/app/admin/customer-payments.tsx', 'utf8');
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
  if (!service.includes(token)) {
    throw new Error('Payment service void contract missing: ' + token);
  }
}

if (/\.from\(['"]payments['"]\)\.delete\(\)/.test(service) || /deleteCustomerPayment|deleteMembershipPayment/.test(service)) {
  throw new Error('Payment service returned to physical deletion.');
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
