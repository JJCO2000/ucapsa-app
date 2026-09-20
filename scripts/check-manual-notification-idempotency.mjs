import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-manual-notification-idempotency.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/send-notification/index.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const service = fs.readFileSync('src/services/admin-notifications.service.ts', 'utf8');
const screen = fs.readFileSync('src/app/admin/notifications.tsx', 'utf8');

const sqlRequired = [
  "check (status in ('queued', 'sending', 'sent', 'error'))",
  'notification_deliveries_campaign_token_unique',
  'create or replace function public.admin_prepare_notification_campaign',
  'pg_advisory_xact_lock',
  "now() - interval '5 minutes'",
  "'draft',\n    0,\n    0,\n    0",
  "'source', 'admin_manual'",
  'revoke all on function public.admin_prepare_notification_campaign',
];

for (const token of sqlRequired) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Manual notification idempotency SQL contract missing: ' + token);
  }
}

const edgeRequired = [
  'campaign_id?: string',
  "userClient.rpc('admin_prepare_notification_campaign'",
  ".eq('status', 'draft')",
  "status: 'queued'",
  ".update({ status: 'sending' })",
  'Este envio ya fue reclamado',
  'No se reenvio',
];

for (const token of edgeRequired) {
  if (!edge.includes(token)) {
    throw new Error('Manual notification Edge contract missing: ' + token);
  }
}

if (/\.from\(['"]notification_campaigns['"]\)\s*\.insert\(/s.test(edge)) {
  throw new Error('send-notification must not create campaigns directly; PostgreSQL preparation is the SSOT.');
}

const deliveryInsert = edge.indexOf(".from('notification_deliveries')\n    .insert(queuedRows)");
const expoFetch = edge.indexOf("fetch('https://exp.host/--/api/v2/push/send'");
if (deliveryInsert < 0 || expoFetch < 0 || deliveryInsert > expoFetch) {
  throw new Error('Delivery evidence must be prepared before the external Expo effect.');
}

const markSending = edge.indexOf(".update({ status: 'sending' })");
if (markSending < 0 || markSending > expoFetch) {
  throw new Error('Delivery rows must be marked sending before the external Expo effect.');
}

for (const token of [
  'ADMIN_NOTIFICATION_TITLE_MAX_LENGTH = 80',
  'ADMIN_NOTIFICATION_BODY_MAX_LENGTH = 180',
  'prepareAdminNotification',
  'sendPreparedAdminNotification',
  "p_reuse_recent: false",
]) {
  if (!service.includes(token)) {
    throw new Error('Manual notification client service contract missing: ' + token);
  }
}

for (const token of [
  'pendingSend',
  'prepareAdminNotification',
  'sendPreparedAdminNotification',
  'setPendingSend({ campaignId, signature })',
  'Reintentar sin duplicar',
  'ADMIN_NOTIFICATION_TITLE_MAX_LENGTH',
  'ADMIN_NOTIFICATION_BODY_MAX_LENGTH',
]) {
  if (!screen.includes(token)) {
    throw new Error('Manual notification admin UI contract missing: ' + token);
  }
}

if (/sendAdminNotification\s*\(/.test(screen)) {
  throw new Error('Admin Notifications returned to the one-phase send wrapper.');
}

if (/maxLength=\{?(?:120|500)\}?/.test(screen)) {
  throw new Error('Admin Notifications limits diverged from the backend contract.');
}

if (!pkg.includes('"check:manual-notification-idempotency"')) {
  throw new Error('npm verify does not include the manual notification idempotency guard.');
}

console.log('UCAPSA manual notification idempotency backend + client: PASS');
