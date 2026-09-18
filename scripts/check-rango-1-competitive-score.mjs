import fs from 'node:fs';

const file = 'supabase/sql/ucapsa-rango-1-competitive-score.sql';
const sql = fs.readFileSync(file, 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  'create or replace view public.ucapsa_competition_scores',
  'security_invoker = true',
  'from public.ucapsa_competition_inputs i',
  'constancy_events_count',
  'official_exam_points_awarded',
  'admin_adjustment_points',
  'constancy_points',
  'exam_points',
  'competitive_score',
  'grant select on table public.ucapsa_competition_scores to authenticated',
  'grant select on table public.ucapsa_competition_scores to service_role',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error('Competitive score contract missing: ' + token);
  }
}

const normalized = sql.replace(/\s+/g, ' ');
if (!/coalesce\(i\.constancy_events_count, 0\)::numeric\s*\+\s*coalesce\(i\.official_exam_points_awarded, 0::numeric\)\s*\+\s*coalesce\(i\.admin_adjustment_points, 0\)::numeric/.test(normalized)) {
  throw new Error('Competitive score formula changed: expected constancy + official exam points + admin adjustments.');
}

if (!/coalesce\(i\.constancy_events_count, 0\)::numeric as constancy_points/.test(normalized)) {
  throw new Error('Constancy must remain 1 point per canonical event.');
}

const forbidden = [
  /create\s+table\s+public\.ucapsa_competition_scores/i,
  /weighted_/i,
  /percentage/i,
  /percent/i,
  /multiplier/i,
  /rank_position/i,
  /dense_rank/i,
  /row_number\(\).*order by.*competitive_score/i,
  /podium/i,
  /range_(code|name|level)/i,
  /ucapsa_points_/i,
];

for (const pattern of forbidden) {
  if (pattern.test(sql)) {
    throw new Error('Competitive score SQL contains forbidden behavior: ' + pattern);
  }
}

if (!pkg.includes('check:rango-1-competitive-score')) {
  throw new Error('npm verify does not include competitive score guard.');
}

console.log('Rango 1 competitive score contract: PASS');
