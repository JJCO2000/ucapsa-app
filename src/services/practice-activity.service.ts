import AsyncStorage from '@react-native-async-storage/async-storage';

import { WEEKLY_PRACTICE_GOAL } from '../constants/practice';
import { devWarn } from '../lib/client-diagnostics';
import { supabase } from '../lib/supabase';
import type { PracticeSession } from '../types/app.types';
import {
  buildPracticeEngagementStats,
  localDateKey,
  startOfLocalWeek,
  type PracticeActivityEntry,
  type PracticeActivitySnapshot,
} from './practice.domain';
import {
  readPendingPracticeSessions as readPending,
  type PendingPracticeSession,
} from './practice-outbox.service';
import { flushPendingPracticeSessions } from './practice-sync.service';

export type WeeklyPracticeSummary = {
  count: number;
  goal: number;
  weekStart: string;
  sessions: PracticeSession[];
};

const PRACTICE_ACTIVITY_CACHE_PREFIX = 'ucapsa:practice-activity:v1:';
const PRACTICE_ACTIVITY_DAYS = 400;

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
    if (
      parsed.version !== 1
      || parsed.userId !== userId
      || typeof parsed.savedAt !== 'string'
      || !Array.isArray(parsed.entries)
    ) return null;
    return parsed as PracticeActivityCache;
  } catch (error) {
    devWarn('Practice activity cache could not be read; continuing without cached activity.', error);
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
  } catch (error) {
    devWarn('Practice activity cache could not be written; continuing without persistence.', error);
  }
  return payload;
}

function mergeActivityEntries(
  remote: PracticeActivityEntry[],
  pending: PendingPracticeSession[],
  dogNames: Map<string, string>,
) {
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
  } catch (error) {
    devWarn('Practice activity cache could not be cleared during logout.', error);
  }
}

export async function getCachedMyPracticeActivity(
  userId: string,
): Promise<PracticeActivitySnapshot | null> {
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

export async function getMyPracticeActivity(
  userId: string,
  daysBack = PRACTICE_ACTIVITY_DAYS,
): Promise<PracticeActivitySnapshot> {
  const cached = await readPracticeActivityCache(userId);
  await flushPendingPracticeSessions(userId).catch((error) => {
    devWarn('Best-effort practice flush failed before activity read; continuing with local/remote merge.', error);
  });
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
        if (typeof row.id === 'string' && typeof row.name === 'string') {
          dogNames.set(row.id, row.name);
        }
      }
    }

    const remote = ((practiceResult.data ?? []) as PracticeSession[])
      .map<PracticeActivityEntry>((item) => ({
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
    return {
      entries,
      stats: buildPracticeEngagementStats(entries),
      source: 'remote',
      savedAt: stored.savedAt,
    };
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

export async function getMyWeeklyPracticeSummary(input?: {
  enrollmentId?: string | null;
  dogId?: string | null;
}): Promise<WeeklyPracticeSummary> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return {
      count: 0,
      goal: WEEKLY_PRACTICE_GOAL,
      weekStart: localDateKey(startOfLocalWeek()),
      sessions: [],
    };
  }

  await flushPendingPracticeSessions(userId).catch((error) => {
    devWarn('Best-effort practice flush failed before weekly summary read; continuing with the current remote/local view.', error);
  });

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
  return {
    count: sessions.length,
    goal: WEEKLY_PRACTICE_GOAL,
    weekStart: localDateKey(weekStart),
    sessions,
  };
}
