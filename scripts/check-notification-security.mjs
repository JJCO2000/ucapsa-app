import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-notification-security-history-hardening.sql', 'utf8');
const service = fs.readFileSync('src/services/admin-notifications.service.ts', 'utf8');
const screen = fs.readFileSync('src/app/admin/notifications.tsx', 'utf8');
const edge = fs.readFileSync('supabase/functions/send-notification/index.ts', 'utf8');
const notificationService = fs.readFileSync('src/services/notifications.service.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'notification_campaigns_title_check',
  "btrim(title) <> ''",
  'char_length(title) <= 80',
  'notification_campaigns_body_check',
  'char_length(body) <= 180',
  'notification_campaigns_counts_check',
  'success_count + failure_count <= total_targets',
  'drop policy if exists "notification_campaigns_admin_update"',
  'revoke insert, update on table public.notification_campaigns',
  'revoke insert, update on table public.notification_deliveries',
  'create or replace function public.admin_archive_notification_campaign',
  "v_row.status = 'sending'",
  'revoke all on function public.admin_archive_notification_campaign(uuid)',
  'Users can read own notification preferences',
  'using ((select auth.uid()) = user_id)',
  'Users can update own notification preferences',
  'Users can read own notification tokens',
  'revoke insert, update on table public.notification_tokens',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Notification security/history SQL contract missing: ' + token);
  }
}

if (/is_ucapsa_admin\(\)[\s\S]{0,100}user_id/.test(
  sql.slice(sql.indexOf('Users can read own notification preferences')),
)) {
  throw new Error('Notification consent/device policies reintroduced Admin access to user-owned data.');
}

for (const token of [
  'archiveAdminNotificationCampaign',
  "supabase.rpc('admin_archive_notification_campaign'",
]) {
  if (!service.includes(token)) {
    throw new Error('Notification campaign archive boundary missing: ' + token);
  }
}

if (/\.from\(['"]notification_campaigns['"]\)[\s\S]{0,180}\.update\(/.test(service)) {
  throw new Error('Admin notification service bypassed the canonical campaign archive RPC.');
}

if (!screen.includes('archiveAdminNotificationCampaign')) {
  throw new Error('Admin notification history is not using canonical archive semantics.');
}
if (screen.includes('deleteAdminNotificationCampaign')) {
  throw new Error('Notification campaign archive regressed to destructive naming.');
}

for (const token of [
  "expoErrorCode === 'DeviceNotRegistered'",
  ".from('notification_tokens')",
  'is_active: false',
  'disabled_at: disabledAt',
  ".eq('id', recipient.id)",
  ".eq('is_active', true)",
  'console.warn(',
]) {
  if (!edge.includes(token)) {
    throw new Error('Expo invalid-token lifecycle contract missing: ' + token);
  }
}

for (const token of [
  "supabase.rpc('upsert_notification_token'",
  "supabase.rpc('disable_notification_token'",
]) {
  if (!notificationService.includes(token)) {
    throw new Error('Notification token client boundary missing: ' + token);
  }
}

if (/\.from\(['"]notification_tokens['"]\)[\s\S]{0,180}\.(?:insert|update|upsert)\(/.test(notificationService)) {
  throw new Error('Client notification service writes tokens directly instead of canonical RPCs.');
}

if (!pkg.includes('"check:notification-security"')) {
  throw new Error('npm verify does not include notification security guard.');
}

console.log('UCAPSA notification consent, history and invalid-token security: PASS');
