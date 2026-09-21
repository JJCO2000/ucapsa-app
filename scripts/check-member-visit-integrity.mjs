import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-member-visit-integrity-hardening.sql', 'utf8');
const service = fs.readFileSync('src/services/member-visits.service.ts', 'utf8');
const offlineSql = fs.readFileSync('supabase/sql/ucapsa-offline-attendance-outbox.sql', 'utf8');
const deleteAuditSql = fs.readFileSync('supabase/sql/ucapsa-attendance-visit-delete-audit.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'create or replace function public.register_member_visit_from_qr',
  "start_date is null or start_date <= v_capture_date",
  "v_capture > v_server_now + interval '10 minutes'",
  'create or replace function public.register_member_visit_admin',
  "v_visited_at > clock_timestamp() + interval '10 minutes'",
  "start_date is null or start_date <= v_visit_date",
  'create or replace function public.correct_member_visit_admin',
  "'member_visit.update'",
  "'before', to_jsonb(v_before)",
  "'after', to_jsonb(v_after)",
  'revoke insert, update, delete on table public.member_visits from authenticated',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Member-visit integrity contract missing: ' + token);
  }
}

if (!/correct_member_visit_admin[\s\S]{0,1800}for update/i.test(sql)) {
  throw new Error('Member visit correction must lock the row before creating before/after audit evidence.');
}

if (!/correct_member_visit_admin[\s\S]{0,2600}v_visit_date < v_start_date/i.test(sql)) {
  throw new Error('Member visit correction can still move a visit before membership start.');
}

for (const token of [
  "supabase.rpc('register_member_visit_from_qr'",
  "supabase.rpc('register_member_visit_admin'",
  "supabase.rpc('correct_member_visit_admin'",
  "supabase.rpc('delete_member_visit_admin'",
]) {
  if (!service.includes(token)) {
    throw new Error('Member visit service bypassed canonical RPC: ' + token);
  }
}

if (!offlineSql.includes('member_visits_user_client_event_unique_idx')) {
  throw new Error('Member visit idempotency index disappeared from the offline contract.');
}
if (!deleteAuditSql.includes("'member_visit.delete'")) {
  throw new Error('Member visit deletion lost its audit trail.');
}

if (!pkg.includes('"check:member-visit-integrity"')) {
  throw new Error('npm verify does not include the member-visit integrity guard.');
}

console.log('UCAPSA member-visit time, membership and audit integrity: PASS');
