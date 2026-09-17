import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-dog-awards.sql', 'utf8');

const required = [
  'dog_awards_one_dog_of_year_per_season_idx',
  'ucapsa_validate_dog_award',
  "new.award_code = 'dog_of_year' and new.season_id is null",
  'create or replace view public.ucapsa_dog_award_summary',
  'with (security_invoker = true)',
  'admin_grant_ucapsa_dog_award',
  'admin_revoke_ucapsa_dog_award',
  'ucapsa_dog_award.grant',
  'ucapsa_dog_award.revoke',
  'revoked_at is null',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 dog award contract missing: ${token}`);
  }
}

const withoutComments = sql.replace(/--.*$/gm, '');

if (/rank(ing)?|podio|leaderboard/i.test(withoutComments)) {
  throw new Error('Permanent awards must not be derived from Ranking/Podio.');
}

if (/delete\s+from\s+public\.dog_awards/i.test(withoutComments)) {
  throw new Error('Dog awards must preserve history; revocation cannot DELETE rows.');
}

if (/p_reason\b/i.test(withoutComments)) {
  throw new Error('Award grant/revoke must not require a reason; note remains optional.');
}

console.log('Rango 1 permanent dog awards: PASS');
