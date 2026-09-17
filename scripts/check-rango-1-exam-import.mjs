import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-exam-excel-import.sql', 'utf8');
const revertHardening = fs.readFileSync('supabase/sql/ucapsa-rango-1-exam-import-revert-hardening.sql', 'utf8');
const dogResolutionHardening = fs.readFileSync('supabase/sql/ucapsa-rango-1-exam-import-dog-resolution-hardening.sql', 'utf8');

const required = [
  'create table if not exists public.ucapsa_exam_import_rows',
  'member_number text',
  'dog_name text',
  'validation_status',
  'validation_errors',
  'attempt_id uuid references public.ucapsa_exam_attempts',
  'create or replace view public.ucapsa_exam_import_preview',
  'security_invoker=true',
  'admin_create_ucapsa_exam_import_batch',
  'admin_validate_ucapsa_exam_import_batch',
  'admin_commit_ucapsa_exam_import_batch',
  'admin_review_ucapsa_exam_import_batch',
  'admin_publish_ucapsa_exam_import_batch',
  'admin_revert_ucapsa_exam_import_batch',
  'ucapsa_exam_import_snapshot',
  "validation_status='valid'",
  'admin_create_ucapsa_exam_attempt',
  'admin_upsert_ucapsa_exam_item_result',
  'admin_review_ucapsa_exam_attempt',
  'admin_publish_ucapsa_exam_attempt',
  "a.status='published' or a.is_official=true",
  'from public, anon, authenticated',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 exam import contract missing: ${token}`);
  }
}

if (!/member_number\s*=\s*v_member_number/i.test(sql)) {
  throw new Error('Exam import must resolve the account from unique member_number.');
}

if (!/lower\(btrim\(d\.name\)\)=lower\(v_dog_name\)/i.test(sql)) {
  throw new Error('Exam import must resolve a dog inside the identified account, not by global name.');
}

if (!/v_snapshot\s+is\s+distinct\s+from\s+\(v_batch\.metadata->'exam_snapshot'\)/i.test(sql)) {
  throw new Error('Exam definition must be rechecked at commit so preview cannot go stale.');
}

if (/create table[\s\S]*?ucapsa_exam_import_rows[\s\S]*?\b(total_score|total_points)\s+(numeric|integer|bigint|double|real)/i.test(sql)) {
  throw new Error('Import staging must not persist an editable exam total.');
}

if (!/where batch_id=p_batch_id and validation_status='valid'/i.test(sql)) {
  throw new Error('Only validated rows may become canonical exam attempts.');
}

for (const token of [
  'create or replace function public.admin_revert_ucapsa_exam_import_batch',
  'admin_void_ucapsa_exam_attempt',
  "a.status='published' or a.is_official=true",
  "set status='reverted'",
  "'voided_attempts'",
]) {
  if (!revertHardening.includes(token)) {
    throw new Error(`Rango 1 import reversion hardening missing: ${token}`);
  }
}

if (/delete\s+from\s+public\.ucapsa_exam_attempts/i.test(revertHardening)) {
  throw new Error('Reverting an import must void attempts, not erase their audit trail.');
}

for (const token of [
  'select count(*) into v_match_count',
  'if v_match_count=1 then',
  'select d.id into v_dog_id',
  'dog_ambiguous',
  'dog_not_found',
]) {
  if (!dogResolutionHardening.includes(token)) {
    throw new Error(`Rango 1 dog resolution hardening missing: ${token}`);
  }
}

if (/min\s*\(\s*d\.id\s*\)/i.test(dogResolutionHardening)) {
  throw new Error('Dog resolution must not use min(uuid); resolve the single match explicitly.');
}

console.log('Rango 1 exam import contract: PASS');
