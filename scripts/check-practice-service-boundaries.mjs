import fs from 'node:fs';

const facadePath = 'src/services/practice.service.ts';
const activityPath = 'src/services/practice-activity.service.ts';
const syncPath = 'src/services/practice-sync.service.ts';
const domainPath = 'src/services/practice.domain.ts';
const outboxPath = 'src/services/practice-outbox.service.ts';

const facade = fs.readFileSync(facadePath, 'utf8');
const activity = fs.readFileSync(activityPath, 'utf8');
const sync = fs.readFileSync(syncPath, 'utf8');
const domain = fs.readFileSync(domainPath, 'utf8');
const outbox = fs.readFileSync(outboxPath, 'utf8');
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

for (const line of [
  "export { buildPracticeEngagementStats } from './practice.domain';",
  "export * from './practice-activity.service';",
  "export * from './practice-sync.service';",
]) {
  if (!facade.includes(line)) {
    throw new Error('Practice compatibility facade lost export: ' + line);
  }
}

if (/AsyncStorage|lib\/supabase|\bsupabase\.|\bfunction\s+|\bconst\s+/.test(facade)) {
  throw new Error('practice.service.ts must remain a compatibility facade without implementation.');
}

for (const token of [
  'getCachedMyPracticeActivity',
  'getMyPracticeActivity',
  'getMyWeeklyPracticeSummary',
  'readPracticeActivityCache',
  'writePracticeActivityCache',
  'mergeActivityEntries',
]) {
  if (!activity.includes(token)) {
    throw new Error('Practice activity boundary missing: ' + token);
  }
}

for (const token of [
  'createKeyedInFlightCoalescer<void>',
  'coalescePracticeSync',
  "p_client_event_id: item.clientEventId",
  'flushPendingPracticeSessions',
  'getPendingPracticeCounts',
  'saveMyPracticeSession',
  "from './practice-outbox.service'",
]) {
  if (!sync.includes(token)) {
    throw new Error('Practice sync boundary missing: ' + token);
  }
}

if (!activity.includes("from './practice-sync.service'")) {
  throw new Error('Practice activity reads must consume the canonical sync boundary.');
}
if (!activity.includes("from './practice-outbox.service'")) {
  throw new Error('Practice activity reads must merge canonical pending outbox entries.');
}

for (const [name, text] of [
  ['practice activity', activity],
  ['practice sync', sync],
  ['practice domain', domain],
  ['practice outbox', outbox],
]) {
  if (/from ['"]\.\/practice\.service['"]/.test(text)) {
    throw new Error(name + ' created a reverse dependency through the compatibility facade.');
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

if (/export function buildPracticeEngagementStats/.test(activity) || /export function buildPracticeEngagementStats/.test(sync)) {
  throw new Error('Practice engagement rules were duplicated outside practice.domain.ts.');
}

if (!outbox.includes("state?: 'pending' | 'rejected'")) {
  throw new Error('Practice outbox lost rejected state persistence.');
}
for (const token of [
  "if (item.state === 'rejected') continue;",
  "state: 'rejected'",
  "message: getErrorMessage(error)",
]) {
  if (!sync.includes(token)) {
    throw new Error('Practice rejected-sync contract missing: ' + token);
  }
}

for (const token of [
  'PERMANENT_PRACTICE_REJECTION_MESSAGES',
  'isPermanentPracticeRejection',
  "La inscripción ya no está activa o no pertenece a tu cuenta.",
  "Practice sync failed with an unclassified error; preserving pending operation.",
  "Practice save was not confirmed; preserving pending operation.",
]) {
  if (!sync.includes(token)) {
    throw new Error('Practice transient-vs-permanent classification missing: ' + token);
  }
}

for (const token of [
  "Practice activity cache could not be read; continuing without cached activity.",
  "Practice activity cache could not be written; continuing without persistence.",
  "Practice activity cache could not be cleared during logout.",
  "Best-effort practice flush failed before activity read; continuing with local/remote merge.",
  "Best-effort practice flush failed before weekly summary read; continuing with the current remote/local view.",
]) {
  if (!activity.includes(token)) {
    throw new Error('Practice activity fallback contract missing: ' + token);
  }
}

const saveStart = sync.indexOf('export async function saveMyPracticeSession');
const saveContract = saveStart >= 0 ? sync.slice(saveStart) : '';
const saveRemovals = saveContract.match(/await removePending\(input\.userId, clientEventId\);/g) ?? [];
if (saveRemovals.length !== 2) {
  throw new Error('Practice save must remove local evidence only after confirmed sync or explicit permanent rejection.');
}

if (!/if \(isPermanentPracticeRejection\(error\)\)[\s\S]{0,260}removePending\(input\.userId, clientEventId\)[\s\S]{0,120}throw error/.test(sync)) {
  throw new Error('Practice save lost the explicit permanent-rejection removal path.');
}

if (/flushPendingPracticeSessions\([^)]*\)\.catch\(\(\) => undefined\)/.test(activity)) {
  throw new Error('Practice activity reads returned to a silent best-effort flush.');
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

for (const [name, text, maxLines] of [
  ['practice facade', facade, 30],
  ['practice activity', activity, 300],
  ['practice sync', sync, 240],
  ['practice domain', domain, 190],
  ['practice outbox', outbox, 150],
]) {
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    throw new Error(name + ' grew beyond its responsibility boundary: ' + lines + ' > ' + maxLines + '.');
  }
}

if (!pkg.includes('"check:practice-service-boundaries"')) {
  throw new Error('npm verify does not include the practice service boundary guard.');
}

console.log('UCAPSA practice domain/activity/sync/outbox boundaries: PASS');
