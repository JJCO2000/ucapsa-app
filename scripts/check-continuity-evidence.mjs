import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-continuity-evidence.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  'create table if not exists public.ucapsa_value_exposures',
  "surface in ('constancy_summary', 'constancy_detail')",
  'ucapsa_value_exposures_daily_unique',
  'alter table public.ucapsa_value_exposures enable row level security',
  'revoke all on table public.ucapsa_value_exposures from public, anon, authenticated',
  'drop function if exists public.record_ucapsa_value_exposure(uuid, uuid, text)',
  'create or replace function public.record_ucapsa_value_exposure',
  'p_occurred_at timestamptz default now()',
  'v_user_id uuid := auth.uid()',
  "v_event_date := (timezone('America/Mexico_City', v_occurred_at))::date",
  'd.user_id = v_user_id',
  'from public.ucapsa_competition_ranges r',
  'r.owner_user_id = v_user_id',
  'on conflict (user_id, dog_id, season_id, surface, event_date)',
  'do nothing',
  'create or replace view public.ucapsa_continuity_observations',
  'r.owner_user_id as user_id',
  'group by r.owner_user_id, r.season_id',
  'from public.ucapsa_value_exposures e',
  'from public.ucapsa_constancy_events ev',
  "ev.event_date > (timezone('America/Mexico_City', x.first_exposure_at))::date",
  "pay.status = 'paid'",
  'pay.paid_at > x.first_exposure_at',
  "membership_payment_within_30d_after_exposure",
  "activity_within_7d_after_exposure",
  "activity_within_30d_after_exposure",
  "activity_within_60d_after_exposure",
  "activity_within_90d_after_exposure",
  "cohort_followup_complete",
  "early_value_exposure",
  "c.first_activity_date + 37",
  "cohort_membership_payments_30d",
  "left join lateral (",
  "order by m.created_at desc",
  'create or replace function public.get_ucapsa_continuity_observations',
  "p.role::text in ('admin', 'super_admin')",
  'grant execute on function public.record_ucapsa_value_exposure(uuid, uuid, text, timestamptz)',
  'grant execute on function public.get_ucapsa_continuity_observations',
];

for (const token of required) {
  if (!sql.includes(token)) throw new Error('Continuity evidence contract missing: ' + token);
}

if (!/v_occurred_at > now\(\) \+ interval '5 minutes'/.test(sql)) {
  throw new Error('Exposure RPC must reject future client timestamps.');
}

if (!/obligation_type[\s\S]{0,220}mensualidad de socio/i.test(sql)) {
  throw new Error('Continuity evidence must distinguish membership payments from other payments.');
}

if (/\b(risk_score|churn_score|renewal_score|renewal_status)\b/i.test(sql)) {
  throw new Error('Continuity evidence must not invent risk/churn/renewal scores.');
}

if (/days_since_last_activity\s*(>|>=|<|<=)\s*(30|60|90|100)/i.test(sql)) {
  throw new Error('Continuity evidence must not hardcode inactivity risk thresholds.');
}

if (/create\s+policy[\s\S]{0,220}ucapsa_value_exposures/i.test(sql)) {
  throw new Error('Value exposure table must stay closed to direct client access; use validated RPC.');
}

if (!pkg.includes('check:continuity-evidence')) {
  throw new Error('npm verify does not include continuity evidence guard.');
}

console.log('UCAPSA continuity evidence SQL: PASS');
