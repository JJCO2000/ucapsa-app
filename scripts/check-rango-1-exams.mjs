import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-exam-derivations.sql', 'utf8');
const adminSql = fs.readFileSync('supabase/sql/ucapsa-rango-1-exam-admin-rpcs.sql', 'utf8');

const required = [
  'ucapsa_guard_exam_status_lifecycle',
  'ucapsa_guard_exam_attempt_lifecycle',
  'ucapsa_validate_exam_attempt_publishable',
  'ucapsa_guard_published_exam_result_shape',
  'ucapsa_guard_exam_item_structure_after_publish',
  'create trigger trg_ucapsa_guard_exam_status_lifecycle',
  'create trigger trg_ucapsa_guard_exam_attempt_lifecycle',
  'create trigger trg_ucapsa_guard_published_exam_result_delete',
  'create trigger trg_ucapsa_guard_published_exam_result_keys',
  'create trigger trg_ucapsa_guard_exam_item_structure_after_publish',
  'create or replace view public.ucapsa_exam_attempt_summary',
  'create or replace view public.ucapsa_exam_official_results',
  'create or replace view public.ucapsa_exam_eligibility',
  'with (security_invoker = true)',
  'sum(r.points_awarded)',
  'sum(i.max_points)',
  'count(r.exam_item_id) = count(i.id)',
  "e.status = 'published'",
  'd.id as dog_id',
  's.id as season_id',
  'is_ranking_eligible',
  "v_season_status not in ('active', 'reopened')",
  "a.status in ('reviewed', 'published', 'voided')",
  "v_status in ('reviewed', 'published', 'voided')",
  'new.max_points < v_max_awarded',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 exam SSOT contract missing: ${token}`);
  }
}

if (/alter\s+table\s+public\.ucapsa_exam_attempts[\s\S]*add\s+column\s+.*total/i.test(sql)) {
  throw new Error('Exam total must remain derived; do not add an editable total column to attempts.');
}

if (!sql.includes("v_items_count = 0 or v_results_count <> v_items_count")) {
  throw new Error('Reviewed attempts must require a complete set of item results.');
}

if (!sql.includes("coalesce(req.required_exams_count, 0) > 0")) {
  throw new Error('Eligibility must remain false until at least one required published exam exists.');
}

function extractFunction(text, name) {
  const marker = `create or replace function public.${name}()`;
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new Error(`Exam guard definition missing: ${name}`);
  }

  const end = text.indexOf('\n$$;', start);
  if (end < 0) {
    throw new Error(`Exam guard definition is unterminated: ${name}`);
  }

  return text.slice(start, end + 4).replace(/\s+/g, ' ').trim();
}

const structureGuard = extractFunction(sql, 'ucapsa_guard_exam_item_structure_after_publish');
if (!structureGuard.includes('ucapsa_assert_competition_season_mutable(v_season_id)')) {
  throw new Error('Exam structure guard must enforce current season mutability.');
}
if (!structureGuard.includes('ucapsa_assert_competition_season_mutable(v_target_season_id)')) {
  throw new Error('Exam structure guard must enforce target season mutability when moving an item.');
}

for (const name of [
  'ucapsa_guard_exam_status_lifecycle',
  'ucapsa_guard_exam_attempt_lifecycle',
  'ucapsa_guard_published_exam_result_shape',
  'ucapsa_guard_exam_item_structure_after_publish',
]) {
  const derivationGuard = extractFunction(sql, name);
  const adminGuard = extractFunction(adminSql, name);

  if (derivationGuard !== adminGuard) {
    throw new Error(
      `Exam guard drift detected for ${name}; derivations and Admin RPCs must carry the same canonical definition.`,
    );
  }
}

console.log('Rango 1 exam SSOT derivations: PASS');
