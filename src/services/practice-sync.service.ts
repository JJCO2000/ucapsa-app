import { devWarn } from '../lib/client-diagnostics';
import { supabase } from '../lib/supabase';
import type { PracticeDifficulty } from '../types/app.types';
import {
  DEFAULT_WRITE_TIMEOUT_MS,
  getErrorMessage,
  isLikelyNetworkError,
  withOperationTimeout,
} from '../utils/async.utils';
import { createOfflineUuid } from '../utils/offline-id.utils';
import { createKeyedInFlightCoalescer } from '../utils/keyed-async.utils';
import { startOfLocalWeek } from './practice.domain';
import {
  enqueuePendingPractice as enqueuePending,
  readPendingPracticeSessions as readPending,
  readPendingPracticeSessionsStrict as readPendingStrict,
  removePendingPractice as removePending,
  replacePendingPractice as replacePending,
  type PendingPracticeSession,
} from './practice-outbox.service';

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

const coalescePracticeSync = createKeyedInFlightCoalescer<void>();

function createClientEventId() {
  return createOfflineUuid('practice');
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

const PERMANENT_PRACTICE_REJECTION_MESSAGES = new Set([
  'Falta la inscripción de la práctica.',
  'La dificultad de la práctica no es válida.',
  'Las horas de la práctica no son válidas.',
  'La duración de la práctica no es válida.',
  'La inscripción ya no está activa o no pertenece a tu cuenta.',
]);

function isPermanentPracticeRejection(error: unknown) {
  return PERMANENT_PRACTICE_REJECTION_MESSAGES.has(getErrorMessage(error, ''));
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

      if (isPermanentPracticeRejection(error)) {
        await replacePending(userId, {
          ...item,
          state: 'rejected',
          message: getErrorMessage(error),
        });
        continue;
      }

      devWarn('Practice sync failed with an unclassified error; preserving pending operation.', error);
      break;
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
  const durationSeconds = Math.max(
    0,
    Math.round((completedAt.getTime() - normalizedStartedAt.getTime()) / 1000),
  );
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

  await enqueuePending(pending);

  try {
    await withOperationTimeout(syncOne(pending), DEFAULT_WRITE_TIMEOUT_MS, 'practice-save');
    await removePending(input.userId, clientEventId);
    return { syncStatus: 'synced', clientEventId, completedAt: pending.completedAt };
  } catch (error) {
    if (isLikelyNetworkError(error)) {
      return { syncStatus: 'pending', clientEventId, completedAt: pending.completedAt };
    }

    if (isPermanentPracticeRejection(error)) {
      await removePending(input.userId, clientEventId);
      throw error;
    }

    devWarn('Practice save was not confirmed; preserving pending operation.', error);
    return { syncStatus: 'pending', clientEventId, completedAt: pending.completedAt };
  }
}
