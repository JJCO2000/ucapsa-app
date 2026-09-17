import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-adjustments.sql', 'utf8');

const required = [
  'create unique index if not exists ucapsa_competition_adjustments_one_reversal_idx',
  'ucapsa_guard_competition_adjustment_immutable',
  'admin_add_ucapsa_competition_adjustment',
  'admin_reverse_ucapsa_competition_adjustment',
  "p_note text default null",
  "v_season_status not in ('active','reopened')",
  '-v_original.points',
  'reversal_of_id = v_original.id',
  'ucapsa_competition_adjustment_summary',
  'security_invoker=true',
  'sum(a.points)',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 adjustments contract missing: ${token}`);
  }
}

if (/\breason\b/i.test(sql)) {
  throw new Error('Rango 1 adjustments must not require a reason field.');
}

if (/update\s+public\.ucapsa_competition_adjustments\s+set\s+points/i.test(sql)) {
  throw new Error('Competition adjustments must be append-only; points cannot be overwritten.');
}

if (/delete\s+from\s+public\.ucapsa_competition_adjustments/i.test(sql)) {
  throw new Error('Competition adjustments must never be deleted to correct history.');
}

if (!/group by\s+a\.season_id\s*,\s*a\.dog_id/i.test(sql)) {
  throw new Error('Adjustment summary must remain dog-specific per season.');
}

if (!/p_points\s+is\s+null\s+or\s+p_points\s*=\s*0/i.test(sql)) {
  throw new Error('Manual adjustment RPC must reject zero-valued movements.');
}

console.log('Rango 1 competition adjustments contract: PASS');
