import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-exam-admin-rpcs.sql', 'utf8');
const freezeSql = fs.readFileSync('supabase/sql/ucapsa-exam-published-structure-freeze.sql', 'utf8');

const requiredRpcs = [
  'admin_create_ucapsa_exam',
  'admin_update_ucapsa_exam',
  'admin_publish_ucapsa_exam',
  'admin_add_ucapsa_exam_item',
  'admin_update_ucapsa_exam_item',
  'admin_delete_ucapsa_exam_item',
  'admin_create_ucapsa_exam_attempt',
  'admin_upsert_ucapsa_exam_item_result',
  'admin_delete_ucapsa_exam_item_result',
  'admin_review_ucapsa_exam_attempt',
  'admin_publish_ucapsa_exam_attempt',
  'admin_set_ucapsa_exam_official_attempt',
  'admin_void_ucapsa_exam_attempt',
];

for (const rpc of requiredRpcs) {
  if (!sql.includes(`public.${rpc}`)) {
    throw new Error(`Rango 1 exam admin RPC missing: ${rpc}`);
  }
}

const requiredContracts = [
  'public.is_ucapsa_admin()',
  'public.ucapsa_exam_admin_audit',
  "v_season_status not in ('active', 'reopened')",
  "a.status in ('reviewed', 'published', 'voided')",
  "v_status in ('reviewed', 'published', 'voided')",
  "v_exam_status is distinct from 'draft'",
  "v_target_exam_status is distinct from 'draft'",
  'ucapsa_assert_competition_season_mutable(v_season_id)',
  'ucapsa_assert_competition_season_mutable(v_target_season_id)',
  'new.max_points < v_max_awarded',
  "v_attempt.status in ('reviewed','published')",
  'set is_official=false',
  'set is_official=true',
  "status='voided',is_official=false",
  'grant execute on function',
  'from public, anon, authenticated',
];

for (const token of requiredContracts) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 exam admin contract missing: ${token}`);
  }
}

if (/\bp_reason\b|\breason\s+text\b/i.test(sql)) {
  throw new Error('Exam admin actions must not require a manual reason field.');
}

if (/add\s+column[\s\S]{0,80}\b(total|score_total|total_score)\b/i.test(sql)) {
  throw new Error('Exam totals must remain derived, never stored by Admin RPCs.');
}

if (!sql.includes("v_attempt.status <> 'draft'")) {
  throw new Error('Deleting an item result must remain limited to draft attempts.');
}

const structureGuardMarker = 'create or replace function public.ucapsa_guard_exam_item_structure_after_publish()';
const structureGuardStart = sql.indexOf(structureGuardMarker);
const structureGuardEnd = sql.indexOf(
  'revoke all on function public.ucapsa_guard_exam_item_structure_after_publish()',
  structureGuardStart,
);
if (structureGuardStart < 0 || structureGuardEnd < 0) {
  throw new Error('Exam structure guard definition missing or unterminated.');
}
const structureGuard = sql.slice(structureGuardStart, structureGuardEnd);

for (const token of [
  "v_exam_status is distinct from 'draft'",
  'ucapsa_assert_competition_season_mutable(v_season_id)',
  'ucapsa_assert_competition_season_mutable(v_target_season_id)',
]) {
  if (!structureGuard.includes(token)) {
    throw new Error(`Exam structure guard lost contract: ${token}`);
  }
}

for (const token of [
  "v_exam_status is distinct from 'draft'",
  "v_target_exam_status is distinct from 'draft'",
  "a.status in ('reviewed', 'published', 'voided')",
]) {
  if (!freezeSql.includes(token)) {
    throw new Error(`Published exam structure migration lost contract: ${token}`);
  }
}

console.log('Rango 1 canonical exam Admin RPCs: PASS');
