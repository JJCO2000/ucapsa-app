import fs from 'node:fs';

const file = 'supabase/sql/ucapsa-rango-1-competition-inputs.sql';
const sql = fs.readFileSync(file, 'utf8');

const required = [
  'create or replace view public.ucapsa_competition_inputs',
  'security_invoker = true',
  'public.ucapsa_exam_eligibility',
  'public.ucapsa_constancy_summary',
  'public.ucapsa_exam_official_results',
  'public.ucapsa_competition_adjustment_summary',
  'command_attendances_count',
  'member_visits_count',
  'required_exams_count',
  'completed_required_exams_count',
  'missing_required_exams_count',
  'is_ranking_eligible',
  'official_exam_points_awarded',
  'official_exam_max_points',
  'admin_adjustment_points',
  'has_competition_activity',
  'grant select on table public.ucapsa_competition_inputs to authenticated',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 competition inputs contract missing: ${token}`);
  }
}

const forbidden = [
  /\bcompetitive_score\b/i,
  /\beffective_score\b/i,
  /\brank_position\b/i,
  /\bpodium_medal\b/i,
  /\brange_(code|name|level)\b/i,
  /\bweighted_(score|points)\b/i,
];

for (const pattern of forbidden) {
  if (pattern.test(sql)) {
    throw new Error(`Competition inputs must remain raw/derived inputs only; forbidden token: ${pattern}`);
  }
}

if (/create\s+table\s+.*competition_inputs/i.test(sql)) {
  throw new Error('Competition inputs must remain a derived view, not a persisted total table.');
}

console.log('Rango 1 competition inputs contract: PASS');
