import fs from 'node:fs';

const servicePath = 'src/services/practice.service.ts';
const domainPath = 'src/services/practice.domain.ts';

const service = fs.readFileSync(servicePath, 'utf8');
const domain = fs.readFileSync(domainPath, 'utf8');
const outbox = fs.readFileSync('src/services/practice-outbox.service.ts', 'utf8');
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
  'createKeyedInFlightCoalescer<void>',
  'coalescePracticeSync',
  "p_client_event_id: item.clientEventId",
  "from './practice-outbox.service'",
]) {
  if (!service.includes(token)) {
    throw new Error('Practice service I/O contract missing: ' + token);
  }
}

for (const token of [
  'createKeyedMutationSerializer',
  'readPendingPracticeSessionsStrict',
  'enqueuePendingPractice',
  'removePendingPractice',
  'replacePendingPractice',
]) {
  if (!outbox.includes(token)) {
    throw new Error('Practice outbox concurrency contract missing: ' + token);
  }
}


if (/export function buildPracticeEngagementStats/.test(service)) {
  throw new Error('Practice engagement rules were duplicated back into practice.service.ts.');
}

if (!outbox.includes("state?: 'pending' | 'rejected'")) {
  throw new Error('Practice outbox lost rejected state persistence.');
}
for (const token of [
  "if (item.state === 'rejected') continue;",
  "state: 'rejected'",
  "message: getErrorMessage(error)",
]) {
  if (!service.includes(token)) {
    throw new Error('Practice rejected-sync contract missing: ' + token);
  }
}

for (const token of [
  'PERMANENT_PRACTICE_REJECTION_MESSAGES',
  'isPermanentPracticeRejection',
  "La inscripción ya no está activa o no pertenece a tu cuenta.",
  "Practice sync failed with an unclassified error; preserving pending operation.",
  "Practice save was not confirmed; preserving pending operation.",
  "Practice activity cache could not be read; continuing without cached activity.",
  "Practice activity cache could not be written; continuing without persistence.",
  "Practice activity cache could not be cleared during logout.",
  "Best-effort practice flush failed before activity read; continuing with local/remote merge.",
  "Best-effort practice flush failed before weekly summary read; continuing with the current remote/local view.",
]) {
  if (!service.includes(token)) {
    throw new Error('Practice transient-vs-permanent classification missing: ' + token);
  }
}

if (/catch \(error\)[\s\S]{0,220}if \(isLikelyNetworkError\(error\)\)[\s\S]{0,220}removePending\(input\.userId, clientEventId\)[\s\S]{0,120}throw error/.test(service)) {
  throw new Error('Practice save can still delete local evidence for an unclassified non-network failure.');
}

if (!/if \(isPermanentPracticeRejection\(error\)\)[\s\S]{0,260}removePending\(input\.userId, clientEventId\)[\s\S]{0,120}throw error/.test(service)) {
  throw new Error('Practice save lost the explicit permanent-rejection removal path.');
}

if (/flushPendingPracticeSessions\([^)]*\)\.catch\(\(\) => undefined\)/.test(service)) {
  throw new Error('Practice service returned to a silent best-effort flush.');
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
const outboxLines = outbox.split(/\r?\n/).length;
if (serviceLines > 430) {
  throw new Error('Practice service grew beyond its I/O responsibility boundary: ' + serviceLines + ' > 430.');
}
if (domainLines > 190) {
  throw new Error('Practice domain grew beyond its pure-rule responsibility boundary: ' + domainLines + ' > 190.');
}
if (outboxLines > 150) {
  throw new Error('Practice outbox grew beyond its persistence responsibility boundary: ' + outboxLines + ' > 150.');
}

if (!pkg.includes('"check:practice-service-boundaries"')) {
  throw new Error('npm verify does not include the practice service boundary guard.');
}

console.log('UCAPSA practice domain/service boundary: PASS');
