import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-historical-event-rpc-boundaries.sql', 'utf8');
const practiceSync = fs.readFileSync('src/services/practice-sync.service.ts', 'utf8');
const attendance = fs.readFileSync('src/services/program-attendance.service.ts', 'utf8');
const payments = fs.readFileSync('src/services/payments-admin.service.ts', 'utf8');
const dbTypes = fs.readFileSync('src/types/database.generated.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'revoke insert on table public.admin_audit_logs from authenticated',
  'drop policy if exists "audit_logs_admin_insert"',
  'create or replace function public.guard_program_class_cancellation_history',
  'trg_guard_program_class_cancellation_history',
  'create or replace function public.audit_program_class_cancellation_history',
  'trg_audit_program_class_cancellation_history',
  "'program_class_cancellation.cancel'",
  "'program_class_cancellation.restore'",
  "'program_class_cancellation.link_announcement'",
  'revoke insert on table public.practice_sessions from authenticated',
  'drop policy if exists "practice_sessions_own_insert"',
  'revoke insert, update, delete on table public.program_attendances from authenticated',
  'drop policy if exists "program_attendances_admin_insert"',
  'drop policy if exists "program_attendances_admin_update"',
  'drop policy if exists "program_attendances_admin_delete"',
  'revoke insert, update, delete on table public.payments from authenticated',
  'drop policy if exists "payments_admin_insert"',
  'drop policy if exists "payments_admin_update"',
  'create or replace function public.admin_correct_payment',
  'for update',
  "'payment.correct'",
  'insert into public.admin_audit_logs',
  'before',
  'after',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Historical write boundary missing: ' + token);
  }
}

if (!/register_my_practice_session/.test(practiceSync)) {
  throw new Error('Practice writes no longer use register_my_practice_session RPC.');
}
if (/\.from\(['"]practice_sessions['"]\)[\s\S]{0,220}\.(?:insert|update|delete)\s*\(/.test(practiceSync)) {
  throw new Error('Practice sync bypassed the canonical RPC with a direct table write.');
}

for (const rpc of [
  'register_program_attendance_from_qr',
  'register_program_attendance_admin',
  'correct_program_attendance_admin',
  'delete_program_attendance_admin',
]) {
  if (!attendance.includes(rpc)) {
    throw new Error('Attendance canonical RPC missing from service: ' + rpc);
  }
}
if (/\.from\(['"]program_attendances['"]\)[\s\S]{0,260}\.(?:insert|update|delete)\s*\(/.test(attendance)) {
  throw new Error('Attendance service bypassed canonical RPC history.');
}

for (const rpc of [
  'admin_register_payment',
  'admin_correct_payment',
  'admin_void_payment',
]) {
  if (!payments.includes(rpc)) {
    throw new Error('Payment canonical RPC missing from service: ' + rpc);
  }
}
if (/\.from\(['"]payments['"]\)[\s\S]{0,280}\.(?:insert|update|delete)\s*\(/.test(payments)) {
  throw new Error('Payments admin service bypassed canonical RPC history.');
}
if (!dbTypes.includes('admin_correct_payment: {')) {
  throw new Error('Generated database contract is missing admin_correct_payment.');
}

if (!pkg.includes('"check:historical-write-boundaries"')) {
  throw new Error('npm verify does not include historical write boundary guard.');
}

console.log('UCAPSA historical event write boundaries: PASS');
