import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-event-occurrence-cancellations.sql', 'utf8');
const service = fs.readFileSync('src/services/event-occurrence-cancellations.service.ts', 'utf8');
const eventsUtils = fs.readFileSync('src/utils/events.utils.ts', 'utf8');
const calendar = fs.readFileSync('src/app/(tabs)/calendar.tsx', 'utf8');
const adminEvents = fs.readFileSync('src/app/admin/events.tsx', 'utf8');
const customerValue = fs.readFileSync('src/services/customer-value.service.ts', 'utf8');
const cache = fs.readFileSync('src/services/client-read-cache.service.ts', 'utf8');
const offlineSync = fs.readFileSync('src/services/client-offline-sync.service.ts', 'utf8');
const appTypes = fs.readFileSync('src/types/app.types.ts', 'utf8');
const dbTypes = fs.readFileSync('src/types/database.generated.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'create table if not exists public.event_occurrence_cancellations',
  'unique (event_id, occurrence_start)',
  'event_occurrence_cancellations_event_active_idx',
  'alter table public.event_occurrence_cancellations enable row level security',
  'event_occurrence_cancellations_anon_select_public',
  'event_occurrence_cancellations_authenticated_select_visible',
  'event_occurrence_cancellations_admin_insert',
  'event_occurrence_cancellations_admin_update',
  'public.is_admin()',
  'public.has_active_membership()',
  'guard_event_occurrence_cancellation_update',
  'audit_event_occurrence_cancellation_change',
  "'event_occurrence.cancel'",
  "'event_occurrence.restore'",
  "'event_occurrence.reactivate'",
  'insert into public.admin_audit_logs',
  'revoke all on table public.event_occurrence_cancellations',
  'grant select on table public.event_occurrence_cancellations to anon',
  'grant select, insert, update on table public.event_occurrence_cancellations to authenticated',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Event occurrence cancellation SQL contract missing: ' + token);
  }
}

if (/grant\s+delete\s+on\s+table\s+public\.event_occurrence_cancellations/i.test(sql)) {
  throw new Error('Event occurrence cancellation history must not be physically deletable by clients.');
}
if (/delete\s+from\s+public\.event_occurrence_cancellations/i.test(sql)) {
  throw new Error('Event occurrence cancellation migration must preserve history.');
}

for (const token of [
  'getVisibleEventOccurrenceCancellations',
  'getAdminEventOccurrenceCancellations',
  'cancelEventOccurrences',
  'restoreEventOccurrenceCancellation',
  ".from('event_occurrence_cancellations')",
  ".upsert(payload, { onConflict: 'event_id,occurrence_start' })",
  ".is('restored_at', null)",
]) {
  if (!service.includes(token)) {
    throw new Error('Event occurrence cancellation service contract missing: ' + token);
  }
}
if (/\.delete\s*\(/.test(service)) {
  throw new Error('Event occurrence cancellation service reintroduced physical delete.');
}

for (const token of [
  'EventOccurrenceCancellation',
  'activeCancellationKeys',
  'occurrenceCancellationKey',
  'expandEventOccurrences(events, cancellations)',
]) {
  if (!eventsUtils.includes(token)) {
    throw new Error('Event occurrence filtering contract missing: ' + token);
  }
}

for (const token of [
  'calendarEventCancellations',
  'getVisibleEventOccurrenceCancellations',
  'expandEventOccurrences(events, eventCancellations)',
  'getUpcomingOccurrences(events, 3, eventCancellations)',
  'occurrenceStart=',
]) {
  if (!calendar.includes(token)) {
    throw new Error('Calendar occurrence-cancellation integration missing: ' + token);
  }
}

for (const token of [
  'getAdminEventOccurrenceCancellations',
  'cancelEventOccurrences',
  'restoreEventOccurrenceCancellation',
  'selectedOccurrenceStart',
  'Cancelar esta',
  'Cancelar desde esta',
  'Fechas canceladas',
]) {
  if (!adminEvents.includes(token)) {
    throw new Error('Admin event occurrence management missing: ' + token);
  }
}

for (const token of [
  'getVisibleEventOccurrenceCancellations',
  'event_cancellations',
  'getUpcomingOccurrences(events, 1, eventCancellations)',
]) {
  if (!customerValue.includes(token)) {
    throw new Error('Customer Value next-event cancellation contract missing: ' + token);
  }
}

if (!cache.includes("calendarEventCancellations: 'calendar-event-cancellations'")) {
  throw new Error('Offline cache key for event cancellations is missing.');
}
if (!offlineSync.includes('calendarEventCancellations')) {
  throw new Error('Offline warmup does not preserve event cancellation exceptions.');
}

if (!appTypes.includes('export type EventOccurrenceCancellation')) {
  throw new Error('App event occurrence cancellation type is missing.');
}
if (!dbTypes.includes('event_occurrence_cancellations: {')) {
  throw new Error('Generated database contract is missing event_occurrence_cancellations.');
}

if (!pkg.includes('"check:event-occurrence-cancellations"')) {
  throw new Error('npm verify does not include event occurrence cancellation guard.');
}

console.log('UCAPSA recurring event occurrence cancellations: PASS');
