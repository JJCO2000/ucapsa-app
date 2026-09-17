import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-admin-adjustments.sql', 'utf8');

const required = [
  'ucapsa_competition_adjustments_one_reversal_idx',
  'ucapsa_guard_competition_adjustment_append_only',
  'create or replace view public.ucapsa_competition_adjustment_summary',
  'with (security_invoker = true)',
  'sum(a.points) as adjustment_points',
  'admin_add_ucapsa_competition_adjustment',
  'admin_reverse_ucapsa_competition_adjustment',
  "v_season_status not in ('active', 'reopened')",
  'reversal_of_id',
  'ucapsa_competition_adjustment.create',
  'ucapsa_competition_adjustment.reverse',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 admin adjustment contract missing: ${token}`);
  }
}

if (/update\s+public\.ucapsa_competition_adjustments/i.test(sql)) {
  throw new Error('Competition adjustments are append-only; direct UPDATE is forbidden.');
}

if (/delete\s+from\s+public\.ucapsa_competition_adjustments/i.test(sql)) {
  throw new Error('Competition adjustments are append-only; direct DELETE is forbidden.');
}

if (/p_reason\b/i.test(sql)) {
  throw new Error('Admin adjustments must not require a reason; note remains optional.');
}

if (/ucapsa_points_(ledger|participants|seasons|tiers|rules)\s*(?:\.|\()/i.test(
  sql.replace(/--.*$/gm, '')
)) {
  throw new Error('Rango 1 adjustments must not depend on the legacy UCAPSA Points model.');
}

console.log('Rango 1 dog-specific admin adjustments: PASS');
