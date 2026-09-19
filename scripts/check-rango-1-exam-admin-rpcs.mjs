import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-exam-admin-rpcs.sql', 'utf8');

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

console.log('Rango 1 canonical exam Admin RPCs: PASS');
