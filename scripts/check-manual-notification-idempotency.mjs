import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-manual-notification-idempotency.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/send-notification/index.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const sqlRequired = [
  "check (status in ('queued', 'sending', 'sent', 'error'))",
  'notification_deliveries_campaign_token_unique',
  'create or replace function public.admin_prepare_notification_campaign',
  'pg_advisory_xact_lock',
  "now() - interval '5 minutes'",
  "'status',\n    0,\n    0,\n    0",
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

if (!pkg.includes('"check:manual-notification-idempotency"')) {
  throw new Error('npm verify does not include the manual notification idempotency guard.');
}

console.log('UCAPSA manual notification idempotency backend: PASS');
