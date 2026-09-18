import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-payment-void-foundation.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of ['voided_at timestamptz', 'voided_by uuid', 'void_reason text']) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Payment void foundation missing: ' + token);
  }
}

if (/delete\s+from\s+public\.payments/i.test(sql)) {
  throw new Error('Payment void foundation must not delete historical payment rows.');
}

if (!pkg.includes('"check:payment-history"')) {
  throw new Error('npm verify does not include the payment-history guard.');
}

console.log('UCAPSA payment void foundation: PASS');
