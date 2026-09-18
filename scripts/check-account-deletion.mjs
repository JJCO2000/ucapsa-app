import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-account-deletion-workflow.sql', 'utf8');
const auditSql = fs.readFileSync('supabase/sql/ucapsa-account-deletion-audit-trail.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const service = fs.readFileSync('src/services/account-deletion.service.ts', 'utf8');
const settings = fs.readFileSync('src/app/account-settings.tsx', 'utf8');
const adminQueue = fs.readFileSync('src/app/admin/account-deletion-requests.tsx', 'utf8');
const adminTools = fs.readFileSync('src/app/admin/tools-administration.tsx', 'utf8');
const members = fs.readFileSync('src/app/admin/members.tsx', 'utf8');
const profilesService = fs.readFileSync('src/services/profiles.service.ts', 'utf8');

const required = [
  'create table if not exists public.account_deletion_requests',
  "status in ('pending', 'in_review', 'blocked', 'rejected', 'completed')",
  'account_deletion_one_open_request_per_user_idx',
  'create or replace function public.request_my_account_deletion',
  'create or replace function public.admin_update_account_deletion_request',
  "p_status = 'blocked' and p_retention_until is null",
  "p_status = 'completed'",
  'revoke all on function public.request_my_account_deletion(text)',
  'revoke all on function public.admin_update_account_deletion_request(uuid, text, text, date)',
];

const auditRequired = [
  'create table if not exists public.account_deletion_request_events',
  "event_type in ('requested', 'status_changed', 'completed', 'snapshot')",
  'create or replace function public.admin_complete_account_deletion_request',
  "if p_status not in ('in_review', 'blocked', 'rejected')",
  "if v_before.status <> 'blocked'",
  'notification_method = v_method',
  'notification_reference = v_reference',
  'notified_at = v_now',
  "event_type,\n    from_status,\n    to_status",
  'revoke all on function public.admin_complete_account_deletion_request(uuid, text, text, text)',
];

for (const token of auditRequired) {
  if (!auditSql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Account deletion audit contract missing: ' + token);
  }
}

if (/p_status\s+not\s+in\s*\([^)]*completed/i.test(auditSql)) {
  throw new Error('Generic account deletion status RPC can still complete a request.');
}

for (const token of required) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Account deletion workflow contract missing: ' + token);
  }
}

if (/delete\s+from\s+auth\.users|delete\s+from\s+public\.(profiles|dogs|payments|memberships)/i.test(sql)) {
  throw new Error('Account deletion foundation must not perform destructive deletion before retention is resolved.');
}

for (const [name, text, token] of [
  ['account deletion service', service, 'request_my_account_deletion'],
  ['account settings', settings, 'getMyAccountDeletionRequest'],
  ['superadmin queue', adminQueue, 'getOpenAccountDeletionRequests'],
  ['admin tools', adminTools, '/admin/account-deletion-requests'],
]) {
  if (!text.includes(token)) {
    throw new Error(name + ' is no longer wired to the account deletion SSOT: ' + token);
  }
}

for (const [name, text] of [
  ['account settings', settings],
  ['admin members', members],
]) {
  if (/deletion_requested_at|deletion_request_reason/.test(text)) {
    throw new Error(name + ' returned to the legacy profile deletion flag.');
  }
}

if (/\.from\(['"]profiles['"]\)[\s\S]{0,500}deletion_requested_at/.test(profilesService)) {
  throw new Error('profiles.service.ts returned to writing account deletion state into profiles.');
}

if (!service.includes('completeAccountDeletionRequest') || !service.includes('admin_complete_account_deletion_request')) {
  throw new Error('Account deletion service is not using the dedicated completion RPC.');
}

if (/status:\s*mode === ['"]block['"][\s\S]{0,120}completed/.test(adminQueue)) {
  throw new Error('Admin deletion UI can still complete through the generic status RPC.');
}

for (const token of ['notificationMethod', 'notificationReference', 'completeAccountDeletionRequest']) {
  if (!adminQueue.includes(token)) {
    throw new Error('Admin deletion completion evidence missing: ' + token);
  }
}

if (!/role === 'super_admin'/.test(adminQueue) || !/Redirect/.test(adminQueue)) {
  throw new Error('Account deletion review queue is no longer Superadmin-only.');
}

if (!pkg.includes('"check:account-deletion"')) {
  throw new Error('npm verify does not include the account deletion workflow guard.');
}

console.log('UCAPSA account deletion workflow + UI SSOT: PASS');
