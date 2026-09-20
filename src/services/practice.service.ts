import AsyncStorage from '@react-native-async-storage/async-storage';

import { WEEKLY_PRACTICE_GOAL } from '../constants/practice';
import { supabase } from '../lib/supabase';
import type { PracticeDifficulty, PracticeSession } from '../types/app.types';
import { createOfflineUuid } from '../utils/offline-id.utils';
import { createKeyedInFlightCoalescer } from '../utils/keyed-async.utils';
import {
  DEFAULT_WRITE_TIMEOUT_MS,
  getErrorMessage,
  isLikelyNetworkError,
  withOperationTimeout,
} from '../utils/async.utils';

import {
  buildPracticeEngagementStats,
  localDateKey,
  startOfLocalWeek,
  type PracticeActivityEntry,
  type PracticeActivitySnapshot,
} from './practice.domain';
import {
  enqueuePendingPractice as enqueuePending,
  readPendingPracticeSessions as readPending,
  readPendingPracticeSessionsStrict as readPendingStrict,
  removePendingPractice as removePending,
  replacePendingPractice as replacePending,
  type PendingPracticeSession,
} from './practice-outbox.service';

export { buildPracticeEngagementStats } from './practice.domain';
export type {
  PracticeActivityEntry,
  PracticeActivitySnapshot,
  PracticeEngagementStats,
} from './practice.domain';

export type WeeklyPracticeSummary = {
  count: number;
  goal: number;
  weekStart: string;
  sessions: PracticeSession[];
};

export type PendingPracticeCount = {
  enrollment_id: string | null;
  dog_id: string | null;
  count: number;
};

export type PracticeSaveResult = {
  syncStatus: 'synced' | 'pending';
  clientEventId: string;
  completedAt: string;
};


const PRACTICE_ACTIVITY_CACHE_PREFIX = 'ucapsa:practice-activity:v1:';
const PRACTICE_ACTIVITY_DAYS = 400;
const coalescePracticeSync = createKeyedInFlightCoalescer<void>();

function createClientEventId() {
  return createOfflineUuid('practice');
}

type PracticeActivityCache = {
  version: 1;
  userId: string;
  savedAt: string;
  entries: PracticeActivityEntry[];
};

function practiceActivityCacheKey(userId: string) {
  return `${PRACTICE_ACTIVITY_CACHE_PREFIX}${userId}`;
}

async function readPracticeActivityCache(userId: string): Promise<PracticeActivityCache | null> {
  try {
    const raw = await AsyncStorage.getItem(practiceActivityCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PracticeActivityCache>;
    if (parsed.version !== 1 || parsed.userId !== userId || typeof parsed.savedAt !== 'string' || !Array.isArray(parsed.entries)) return null;
    return parsed as PracticeActivityCache;
  } catch {
    return null;
  }
}

async function writePracticeActivityCache(userId: string, entries: PracticeActivityEntry[]) {
  const payload: PracticeActivityCache = {
    version: 1,
    userId,
    savedAt: new Date().toISOString(),
    entries,
  };
  try {
    await AsyncStorage.setItem(practiceActivityCacheKey(userId), JSON.stringify(payload));
  } catch {
    // La actividad es una lectura offline; no bloquear la experiencia por la cache.
  }
  return payload;
}

function mergeActivityEntries(remote: PracticeActivityEntry[], pending: PendingPracticeSession[], dogNames: Map<string, string>) {
  const byKey = new Map<string, PracticeActivityEntry>();
  for (const item of remote) {
    byKey.set(item.clientEventId || item.id, item);
  }
  for (const item of pending) {
    const key = item.clientEventId;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: `pending:${item.clientEventId}`,
      clientEventId: item.clientEventId,
      dogId: item.dogId,
      dogName: item.dogName ?? (item.dogId ? dogNames.get(item.dogId) ?? null : null),
      enrollmentId: item.enrollmentId,
      completedAt: item.completedAt,
      difficulty: item.difficulty,
      note: item.note,
      syncStatus: item.state === 'rejected' ? 'rejected' : 'pending',
      syncMessage: item.message ?? null,
    });
  }
  return [...byKey.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export async function clearPracticeActivityCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(practiceActivityCacheKey(userId));
  } catch {
    // No bloquear logout por un fallo de cache.
  }
}

export async function getCachedMyPracticeActivity(userId: string): Promise<PracticeActivitySnapshot | null> {
  const cached = await readPracticeActivityCache(userId);
  const pending = await readPending(userId);
  const dogNames = new Map<string, string>();
  for (const item of cached?.entries ?? []) {
    if (item.dogId && item.dogName) dogNames.set(item.dogId, item.dogName);
  }
  const entries = mergeActivityEntries(cached?.entries ?? [], pending, dogNames);
  if (!cached && entries.length === 0) return null;
  return {
    entries,
    stats: buildPracticeEngagementStats(entries),
    source: cached ? 'cached' : 'local',
    savedAt: cached?.savedAt ?? null,
  };
}

export async function getMyPracticeActivity(userId: string, daysBack = PRACTICE_ACTIVITY_DAYS): Promise<PracticeActivitySnapshot> {
  const cached = await readPracticeActivityCache(userId);
  await flushPendingPracticeSessions(userId).catch(() => undefined);
  const pending = await readPending(userId);
  const cachedDogNames = new Map<string, string>();
  for (const item of cached?.entries ?? []) {
    if (item.dogId && item.dogName) cachedDogNames.set(item.dogId, item.dogName);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(30, daysBack));

  try {
    const [practiceResult, dogResult] = await Promise.all([
      supabase
        .from('practice_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('completed_at', cutoff.toISOString())
        .order('completed_at', { ascending: false }),
      supabase.from('dogs').select('id,name').eq('user_id', userId).eq('is_active', true),
    ]);

    if (practiceResult.error) throw practiceResult.error;
    const dogNames = new Map(cachedDogNames);
    if (!dogResult.error && Array.isArray(dogResult.data)) {
      for (const row of dogResult.data as Array<{ id?: unknown; name?: unknown }>) {
        if (typeof row.id === 'string' && typeof row.name === 'string') dogNames.set(row.id, row.name);
      }
    }

    const remote = ((practiceResult.data ?? []) as PracticeSession[]).map<PracticeActivityEntry>((item) => ({
      id: item.id,
      clientEventId: item.client_event_id,
      dogId: item.dog_id,
      dogName: item.dog_id ? dogNames.get(item.dog_id) ?? null : null,
      enrollmentId: item.enrollment_id,
      completedAt: item.completed_at,
      difficulty: item.difficulty,
      note: item.note,
      syncStatus: 'synced',
    }));
    const stored = await writePracticeActivityCache(userId, remote);
    const entries = mergeActivityEntries(remote, pending, dogNames);
    return { entries, stats: buildPracticeEngagementStats(entries), source: 'remote', savedAt: stored.savedAt };
  } catch (error) {
    const fallback = mergeActivityEntries(cached?.entries ?? [], pending, cachedDogNames);
    if (fallback.length > 0 || cached) {
      return {
        entries: fallback,
        stats: buildPracticeEngagementStats(fallback),
        source: pending.length > 0 && !cached ? 'local' : 'cached',
        savedAt: cached?.savedAt ?? null,
      };
    }
    throw error;
  }
}

async function syncOneOnce(item: PendingPracticeSession) {
  const { data, error } = await supabase.rpc('register_my_practice_session', {
    p_client_event_id: item.clientEventId,
    p_enrollment_id: item.enrollmentId,
    p_started_at: item.startedAt,
    p_completed_at: item.completedAt,
    p_difficulty: item.difficulty,
    p_note: item.note ?? undefined,
    p_duration_seconds: item.durationSeconds ?? undefined,
  });

  if (error) throw error;
  if (!data) throw new Error('El servidor no confirmó la práctica.');
}

function syncOne(item: PendingPracticeSession): Promise<void> {
  return coalescePracticeSync(
    `${item.userId}:${item.clientEventId}`,
    () => syncOneOnce(item),
  );
}

export async function flushPendingPracticeSessions(userId: string): Promise<number> {
  const pending = await readPendingStrict(userId);
  let synced = 0;

  for (const item of pending) {
    if (item.state === 'rejected') continue;
    try {
      await withOperationTimeout(syncOne(item), DEFAULT_WRITE_TIMEOUT_MS, 'practice-sync');
      await removePending(userId, item.clientEventId);
      synced += 1;
    } catch (error) {
      if (isLikelyNetworkError(error)) break;
      await replacePending(userId, { ...item, state: 'rejected', message: getErrorMessage(error) });
    }
  }

  return synced;
}

export async function getPendingPracticeCounts(userId: string): Promise<PendingPracticeCount[]> {
  const weekStart = startOfLocalWeek().getTime();
  const pending = (await readPending(userId)).filter((item) => {
    const completedAt = new Date(item.completedAt).getTime();
    return item.state !== 'rejected' && Number.isFinite(completedAt) && completedAt >= weekStart;
  });

  const counts = new Map<string, PendingPracticeCount>();
  for (const item of pending) {
    const key = item.enrollmentId || item.dogId || 'general';
    const current = counts.get(key) ?? {
      enrollment_id: item.enrollmentId || null,
      dog_id: item.dogId,
      count: 0,
    };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()];
}

export async function getMyWeeklyPracticeSummary(input?: { enrollmentId?: string | null; dogId?: string | null }): Promise<WeeklyPracticeSummary> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) return { count: 0, goal: WEEKLY_PRACTICE_GOAL, weekStart: localDateKey(startOfLocalWeek()), sessions: [] };

  // La sincronización es idempotente por client_event_id. No bloquea la lectura si
  // seguimos offline; la Home puede combinar la caché remota con la cola local.
  await flushPendingPracticeSessions(userId).catch(() => undefined);

  const weekStart = startOfLocalWeek();
  let query = supabase
    .from('practice_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('completed_at', weekStart.toISOString())
    .order('completed_at', { ascending: false });

  if (input?.enrollmentId) query = query.eq('enrollment_id', input.enrollmentId);
  else if (input?.dogId) query = query.eq('dog_id', input.dogId);

  const { data, error } = await query;
  if (error) throw error;
  const sessions = (data ?? []) as PracticeSession[];
  return { count: sessions.length, goal: WEEKLY_PRACTICE_GOAL, weekStart: localDateKey(weekStart), sessions };
}

export async function saveMyPracticeSession(input: {
  userId: string;
  dogId?: string | null;
  dogName?: string | null;
  enrollmentId: string;
  startedAt: string;
  difficulty: PracticeDifficulty;
  note?: string | null;
}): Promise<PracticeSaveResult> {
  const completedAt = new Date();
  const startedAt = new Date(input.startedAt);
  const normalizedStartedAt = Number.isNaN(startedAt.getTime()) ? completedAt : startedAt;
  const durationSeconds = Math.max(0, Math.round((completedAt.getTime() - normalizedStartedAt.getTime()) / 1000));
  const clientEventId = createClientEventId();

  const pending: PendingPracticeSession = {
    version: 1,
    userId: input.userId,
    clientEventId,
    dogId: input.dogId ?? null,
    dogName: input.dogName?.trim() || null,
    enrollmentId: input.enrollmentId,
    startedAt: normalizedStartedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    difficulty: input.difficulty,
    note: input.note?.trim() || null,
    durationSeconds,
    state: 'pending',
    message: null,
  };

  // Primero se guarda localmente. Así una caída de red después de tocar Guardar
  // no hace desaparecer una práctica que el usuario ya terminó.
  await enqueuePending(pending);

  try {
    await withOperationTimeout(syncOne(pending), DEFAULT_WRITE_TIMEOUT_MS, 'practice-save');
    await removePending(input.userId, clientEventId);
    return { syncStatus: 'synced', clientEventId, completedAt: pending.completedAt };
  } catch (error) {
    if (isLikelyNetworkError(error)) {
      return { syncStatus: 'pending', clientEventId, completedAt: pending.completedAt };
    }

    // Un rechazo real del servidor no debe hacerse pasar por un guardado offline.
    await removePending(input.userId, clientEventId);
    throw error;
  }
}
