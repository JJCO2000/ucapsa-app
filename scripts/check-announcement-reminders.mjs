import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-announcement-reminder-atomicity.sql', 'utf8');
const service = fs.readFileSync('src/services/announcement-reminders.service.ts', 'utf8');
const edge = fs.readFileSync('supabase/functions/send-announcement-reminders/index.ts', 'utf8');
const ui = fs.readFileSync('src/app/admin/announcements.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'create or replace function public.admin_replace_announcement_reminders',
  'if not public.is_admin()',
  "jsonb_typeof(v_reminders) <> 'array'",
  'jsonb_array_length(v_reminders) > 5',
  "status = 'no_targets'",
  'archived_at = coalesce(c.archived_at, now())',
  "'retired_reason', 'announcement_reminder_replaced'",
  'insert into public.notification_campaigns',
  'revoke all on function public.admin_replace_announcement_reminders(uuid, jsonb)',
  'to authenticated, service_role',
  'create or replace function public.sync_announcement_reminder_schedule',
  "status = 'no_targets'",
  'create trigger trg_sync_announcement_reminder_schedule',
  'after update of announcement_date on public.announcements',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Announcement reminder atomic RPC contract missing: ' + token);
  }
}

const retireIndex = sql.toLowerCase().indexOf("status = 'no_targets'");
const insertIndex = sql.toLowerCase().indexOf('insert into public.notification_campaigns');
if (retireIndex < 0 || insertIndex < 0 || retireIndex > insertIndex) {
  throw new Error('Announcement reminder replacement lost its single transactional retire -> insert flow.');
}

if (/delete\s+from\s+public\.notification_campaigns/i.test(sql)) {
  throw new Error('Announcement reminder replacement must preserve campaign history instead of deleting rows.');
}

if (!/metadata\s*=\s*c\.metadata\s*\|\|\s*jsonb_build_object[\s\S]*['"]remind_at['"]/i.test(sql)) {
  throw new Error('Announcement date changes no longer recalculate existing reminder remind_at values.');
}

if (!/new\.announcement_date is null[\s\S]*status\s*=\s*['"]no_targets['"][\s\S]*archived_at/i.test(sql)) {
  throw new Error('Removing an announcement date no longer retires existing draft reminders.');
}

if (!service.includes(".from('notification_campaigns')") || !service.includes("action: 'save'")) {
  throw new Error('Announcement reminder service lost direct RLS read or Edge-compatible save boundary.');
}

if (/functions\.invoke\(['"]send-announcement-reminders['"][\s\S]{0,120}action:\s*['"]list['"]/.test(service)) {
  throw new Error('Announcement reminder reads regressed to the Edge Function instead of RLS.');
}

if (!edge.includes("userClient.rpc('admin_replace_announcement_reminders'")) {
  throw new Error('Legacy reminder save path does not delegate to the atomic DB RPC.');
}

const saveBlock = edge.slice(edge.indexOf("if (action === 'save')"), edge.indexOf("if (action !== 'run_due')"));
if (/\.from\(['"]notification_campaigns['"]\)[\s\S]{0,180}\.(?:delete|insert)\s*\(/.test(saveBlock)) {
  throw new Error('Edge reminder save path regained direct delete/insert behavior.');
}

for (const token of [
  "type ReminderLoadState = 'idle' | 'loading' | 'ready' | 'failed'",
  "selected && reminderLoadState !== 'ready'",
  'Reintentar recordatorios',
  "reminderLoadState === 'failed'",
]) {
  if (!ui.includes(token)) {
    throw new Error('Announcement reminder unknown-state protection missing: ' + token);
  }
}

if (!pkg.includes('"check:announcement-reminders"')) {
  throw new Error('npm verify does not include the announcement reminder integrity guard.');
}

console.log('UCAPSA announcement reminder atomicity + unknown-state guard: PASS');
