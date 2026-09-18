import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-payment-void-foundation.sql', 'utf8');
const workflow = fs.readFileSync('supabase/sql/ucapsa-payment-void-workflow.sql', 'utf8');
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

if (!pkg.includes('"check:payment-history"')) {
  throw new Error('npm verify does not include the payment-history guard.');
}

console.log('UCAPSA payment void foundation + DB workflow: PASS');
