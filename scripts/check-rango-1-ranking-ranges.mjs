import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-ranking-ranges.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const required = [
  'create or replace view public.ucapsa_competition_ranges',
  'percent_rank() over',
  'partition by s.season_id',
  'order by coalesce(s.constancy_events_count, 0) desc',
  "when coalesce(r.constancy_events_count, 0) = 0 then 'copper'",
  "when r.constancy_percent_rank < 0.10 then 'gold'",
  "when r.constancy_percent_rank < 0.40 then 'silver'",
  "and r.constancy_percent_rank < 0.05",
  "as is_constancy_outstanding",
  'create or replace view public.ucapsa_competition_leaderboard',
  'where r.is_ranking_eligible is true',
  'coalesce(r.competitive_score, 0::numeric) desc',
  'coalesce(r.command_attendances_count, 0) desc',
  'coalesce(r.exam_points, 0::numeric) desc',
  'r.dog_id asc',
  'row_number() over',
  'eligible_dogs_count',
  'create or replace function public.get_ucapsa_competition_leaderboard',
  'security definer',
  'grant execute on function public.get_ucapsa_competition_leaderboard(uuid)',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error('Ranking/ranges contract missing: ' + token);
  }
}

const percentileOrder = [
  "0.10 then 'gold'",
  "0.40 then 'silver'",
];

let last = -1;
for (const token of percentileOrder) {
  const index = sql.indexOf(token);
  if (index <= last) throw new Error('Range thresholds changed order: ' + token);
  last = index;
}

if (!/percent_rank\(\) over\s*\(\s*partition by s\.season_id\s*order by coalesce\(s\.constancy_events_count, 0\) desc\s*\)/s.test(sql)) {
  throw new Error('Range percentile must use only constancy count so ties share range.');
}

if (/percent_rank\(\)[\s\S]{0,220}(dog_id|competitive_score|exam_points|command_attendances_count)/i.test(sql)) {
  throw new Error('Range percentile must not split constancy ties with secondary ordering.');
}

if (/diamond|platinum|emerald|bronze/i.test(sql)) {
  throw new Error('Public Constancia levels must stay simplified to Cobre/Plata/Oro.');
}

if (!/row_number\(\) over[\s\S]*competitive_score[\s\S]*command_attendances_count[\s\S]*exam_points[\s\S]*dog_id asc/s.test(sql)) {
  throw new Error('Ranking tiebreak order changed.');
}

if (/dense_rank\(|(?:^|[^a-z_])rank\(\) over/im.test(sql)) {
  throw new Error('Ranking must have one deterministic effective position, not shared positions.');
}

const leaderboardStart = sql.indexOf('create or replace view public.ucapsa_competition_leaderboard');
const leaderboardEnd = sql.indexOf('comment on view public.ucapsa_competition_leaderboard');
const leaderboardSql = sql.slice(leaderboardStart, leaderboardEnd);
if (/owner_user_id/.test(leaderboardSql)) {
  throw new Error('Leaderboard safe surface must not expose owner_user_id.');
}

if (/create\s+table\s+public\.(ucapsa_competition_ranges|ucapsa_competition_leaderboard)/i.test(sql)) {
  throw new Error('Rango/Ranking must stay derived views, not editable tables.');
}

if (/podium_medal|create\s+table.*podium/i.test(sql)) {
  throw new Error('Podio must remain positions 1-3 of Ranking, not persisted.');
}

if (!pkg.includes('check:rango-1-ranking-ranges')) {
  throw new Error('npm verify does not include ranking/ranges guard.');
}

console.log('Rango 1 ranking/ranges contract: PASS');
