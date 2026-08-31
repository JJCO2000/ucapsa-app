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

type PendingPracticeSession = {
  version: 1;
  userId: string;
  clientEventId: string;
  dogId: string | null;
  enrollmentId: string;
  startedAt: string;
  completedAt: string;
  difficulty: PracticeDifficulty;
  note: string | null;
  durationSeconds: number | null;
};

const PENDING_PRACTICE_PREFIX = 'ucapsa:practice-pending:v1:';

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
