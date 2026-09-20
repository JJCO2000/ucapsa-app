import fs from 'node:fs';

const servicePath = 'src/services/practice.service.ts';
const domainPath = 'src/services/practice.domain.ts';

const service = fs.readFileSync(servicePath, 'utf8');
const domain = fs.readFileSync(domainPath, 'utf8');
const detail = fs.readFileSync('src/app/client/practice-detail.tsx', 'utf8');
const historyRow = fs.readFileSync('src/components/domain/PracticeHistoryRow.tsx', 'utf8');
const sql = fs.readFileSync('supabase/sql/ucapsa-practice-session-rpc.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const forbidden of ['supabase', 'AsyncStorage', 'withOperationTimeout', 'DEFAULT_WRITE_TIMEOUT_MS']) {
  if (domain.includes(forbidden)) {
    throw new Error('Practice domain must stay pure; found: ' + forbidden);
  }
}

for (const token of [
  'buildPracticeEngagementStats',
  'localDateKey',
  'startOfLocalWeek',
  'PracticeActivityEntry',
  'PracticeActivitySnapshot',
  'PracticeEngagementStats',
]) {
  if (!domain.includes(token)) {
    throw new Error('Practice domain contract missing: ' + token);
  }
}

if (!service.includes("from './practice.domain'")) {
  throw new Error('Practice service no longer consumes the canonical practice domain.');
}

if (!service.includes("export { buildPracticeEngagementStats } from './practice.domain';")) {
  throw new Error('Practice service lost compatibility re-export for engagement stats.');
}

for (const token of [
  'createKeyedMutationSerializer',
  'serializePracticeMutation(item.userId',
  'serializePracticeMutation(userId',
  'createKeyedInFlightCoalescer<void>',
  'coalescePracticeSync',
  "p_client_event_id: item.clientEventId",
]) {
  if (!service.includes(token)) {
    throw new Error('Practice durable outbox concurrency contract missing: ' + token);
  }
}


if (/export function buildPracticeEngagementStats/.test(service)) {
  throw new Error('Practice engagement rules were duplicated back into practice.service.ts.');
}

for (const token of [
  "state?: 'pending' | 'rejected'",
  "if (item.state === 'rejected') continue;",
  "state: 'rejected'",
  "message: getErrorMessage(error)",
]) {
  if (!service.includes(token)) {
    throw new Error('Practice rejected-outbox contract missing: ' + token);
  }
}

if (!domain.includes("'synced' | 'pending' | 'rejected'")) {
  throw new Error('Practice activity domain lost rejected sync state.');
}
if (!detail.includes("entry.syncStatus === 'rejected'") || !historyRow.includes("entry.syncStatus === 'rejected'")) {
  throw new Error('Practice rejected sync state is not visible in client UI.');
}

for (const token of [
  'create or replace function public.register_my_practice_session',
  'security definer',
  'ps.client_event_id = p_client_event_id',
  "e.status = 'active'",
  'when unique_violation',
  'from public, anon, service_role',
  'to authenticated',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Canonical practice RPC SQL missing: ' + token);
  }
}


const serviceLines = service.split(/\r?\n/).length;
const domainLines = domain.split(/\r?\n/).length;
if (serviceLines > 430) {
  throw new Error('Practice service grew beyond its I/O responsibility boundary: ' + serviceLines + ' > 430.');
}
if (domainLines > 190) {
  throw new Error('Practice domain grew beyond its pure-rule responsibility boundary: ' + domainLines + ' > 190.');
}

if (!pkg.includes('"check:practice-service-boundaries"')) {
  throw new Error('npm verify does not include the practice service boundary guard.');
}

console.log('UCAPSA practice domain/service boundary: PASS');
