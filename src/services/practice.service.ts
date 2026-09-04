import AsyncStorage from '@react-native-async-storage/async-storage';

import { WEEKLY_PRACTICE_GOAL } from '../constants/practice';
import { supabase } from '../lib/supabase';
import type { PracticeDifficulty, PracticeSession } from '../types/app.types';
import {
  DEFAULT_WRITE_TIMEOUT_MS,
  getErrorMessage,
  isLikelyNetworkError,
  withOperationTimeout,
} from '../utils/async.utils';

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


export type PracticeActivityEntry = {
  id: string;
  clientEventId: string | null;
  dogId: string | null;
  dogName: string | null;
  enrollmentId: string | null;
  completedAt: string;
  difficulty: PracticeDifficulty;
  note: string | null;
  syncStatus: 'synced' | 'pending';
};

export type PracticeEngagementStats = {
  currentStreak: number;
  longestStreak: number;
  practicedToday: boolean;
  thisWeekCount: number;
  thisMonthCount: number;
  activeDaysThisMonth: number;
  lastPracticeAt: string | null;
  recentDays: Array<{ dateKey: string; label: string; practiced: boolean; isToday: boolean }>;
};

export type PracticeActivitySnapshot = {
  entries: PracticeActivityEntry[];
  stats: PracticeEngagementStats;
  source: 'remote' | 'cached' | 'local';
  savedAt: string | null;
};

type PendingPracticeSession = {
  version: 1;
  userId: string;
  clientEventId: string;
  dogId: string | null;
  dogName: string | null;
  enrollmentId: string;
  startedAt: string;
  completedAt: string;
  difficulty: PracticeDifficulty;
  note: string | null;
  durationSeconds: number | null;
};

const PENDING_PRACTICE_PREFIX = 'ucapsa:practice-pending:v1:';
const PRACTICE_ACTIVITY_CACHE_PREFIX = 'ucapsa:practice-activity:v1:';
const PRACTICE_ACTIVITY_DAYS = 400;


function pendingPracticeKey(userId: string) {
  return `${PENDING_PRACTICE_PREFIX}${userId}`;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfLocalWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);
}

function createClientEventId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function readPending(userId: string): Promise<PendingPracticeSession[]> {
  try {
    const raw = await AsyncStorage.getItem(pendingPracticeKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingPracticeSession => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Partial<PendingPracticeSession>;
      return (
        value.version === 1 &&
        value.userId === userId &&
        typeof value.clientEventId === 'string' &&
        (value.dogName == null || typeof value.dogName === 'string') &&
        typeof value.enrollmentId === 'string' &&
        typeof value.startedAt === 'string' &&
        typeof value.completedAt === 'string' &&
        (value.difficulty === 'easy' || value.difficulty === 'good' || value.difficulty === 'hard')
      );
    });
  } catch {
    return [];
  }
}

async function writePending(userId: string, items: PendingPracticeSession[]) {
  try {
    if (items.length === 0) {
      await AsyncStorage.removeItem(pendingPracticeKey(userId));
      return;
    }
    await AsyncStorage.setItem(pendingPracticeKey(userId), JSON.stringify(items));
  } catch (error) {
    throw new Error(`No se pudo guardar la práctica en este dispositivo: ${getErrorMessage(error)}`);
  }
}

async function enqueuePending(item: PendingPracticeSession) {
  const current = await readPending(item.userId);
  if (current.some((candidate) => candidate.clientEventId === item.clientEventId)) return;
  await writePending(item.userId, [...current, item]);
}

async function removePending(userId: string, clientEventId: string) {
  const current = await readPending(userId);
  await writePending(userId, current.filter((item) => item.clientEventId !== clientEventId));
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
      syncStatus: 'pending',
    });
  }
  return [...byKey.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

function dateKeyFromIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return localDateKey(date);
}

function dayBefore(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const value = new Date(year, month - 1, day, 12, 0, 0, 0);
  value.setDate(value.getDate() - 1);
  return localDateKey(value);
}

export function buildPracticeEngagementStats(entries: PracticeActivityEntry[]): PracticeEngagementStats {
  const practicedDays = new Set(entries.map((item) => dateKeyFromIso(item.completedAt)).filter((value): value is string => Boolean(value)));
  const today = new Date();
  const todayKey = localDateKey(today);
  const yesterday = dayBefore(todayKey);
  const practicedToday = practicedDays.has(todayKey);

  let currentStreak = 0;
  let cursor = practicedToday ? todayKey : practicedDays.has(yesterday) ? yesterday : null;
  while (cursor && practicedDays.has(cursor)) {
    currentStreak += 1;
    cursor = dayBefore(cursor);
  }

  const sortedDays = [...practicedDays].sort();
  let longestStreak = 0;
  let running = 0;
  let previous: string | null = null;
  for (const key of sortedDays) {
    running = previous && dayBefore(key) === previous ? running + 1 : 1;
    longestStreak = Math.max(longestStreak, running);
    previous = key;
  }

  const weekStart = startOfLocalWeek().getTime();
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-`;
  const thisWeekCount = entries.filter((item) => {
    const time = new Date(item.completedAt).getTime();
    return Number.isFinite(time) && time >= weekStart;
  }).length;
  const thisMonthEntries = entries.filter((item) => dateKeyFromIso(item.completedAt)?.startsWith(monthPrefix));
  const activeDaysThisMonth = new Set(thisMonthEntries.map((item) => dateKeyFromIso(item.completedAt)).filter(Boolean)).size;

  const recentDays: PracticeEngagementStats['recentDays'] = [];
  const dayLabels = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset, 12, 0, 0, 0);
    const key = localDateKey(date);
    recentDays.push({ dateKey: key, label: dayLabels[date.getDay()], practiced: practicedDays.has(key), isToday: key === todayKey });
  }

  return {
    currentStreak,
    longestStreak,
    practicedToday,
    thisWeekCount,
    thisMonthCount: thisMonthEntries.length,
    activeDaysThisMonth,
    lastPracticeAt: entries[0]?.completedAt ?? null,
    recentDays,
  };
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

async function syncOne(item: PendingPracticeSession) {
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

export async function flushPendingPracticeSessions(userId: string): Promise<number> {
  const pending = await readPending(userId);
  let synced = 0;

  for (const item of pending) {
    try {
      await withOperationTimeout(syncOne(item), DEFAULT_WRITE_TIMEOUT_MS, 'practice-sync');
      await removePending(userId, item.clientEventId);
      synced += 1;
    } catch (error) {
      // Si no hay red, conserva absolutamente todo y vuelve a intentar más tarde.
      // Si el servidor rechaza un registro, también se conserva para no perder una
      // práctica silenciosamente; un guardado nuevo sí mostrará el error al usuario.
      if (isLikelyNetworkError(error)) break;
    }
  }

  return synced;
}

export async function getPendingPracticeCounts(userId: string): Promise<PendingPracticeCount[]> {
  const weekStart = startOfLocalWeek().getTime();
  const pending = (await readPending(userId)).filter((item) => {
    const completedAt = new Date(item.completedAt).getTime();
    return Number.isFinite(completedAt) && completedAt >= weekStart;
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
