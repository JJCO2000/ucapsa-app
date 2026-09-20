import AsyncStorage from '@react-native-async-storage/async-storage';

import { devWarn } from '../lib/client-diagnostics';
import type { PracticeDifficulty } from '../types/app.types';
import { createKeyedMutationSerializer } from '../utils/keyed-async.utils';
import { getErrorMessage } from '../utils/async.utils';

export type PendingPracticeSession = {
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
  state?: 'pending' | 'rejected';
  message?: string | null;
};

const PENDING_PRACTICE_PREFIX = 'ucapsa:practice-pending:v1:';
const serializePracticeMutation = createKeyedMutationSerializer();

function pendingPracticeKey(userId: string) {
  return `${PENDING_PRACTICE_PREFIX}${userId}`;
}

function isValidPendingPracticeSession(item: unknown, userId: string): item is PendingPracticeSession {
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
    (value.difficulty === 'easy' || value.difficulty === 'good' || value.difficulty === 'hard') &&
    (value.state == null || value.state === 'pending' || value.state === 'rejected') &&
    (value.message == null || typeof value.message === 'string')
  );
}

export async function readPendingPracticeSessionsStrict(userId: string): Promise<PendingPracticeSession[]> {
  const raw = await AsyncStorage.getItem(pendingPracticeKey(userId));
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('La cola local de prácticas tiene un formato inválido.');
  }
  if (!parsed.every((item) => isValidPendingPracticeSession(item, userId))) {
    throw new Error('La cola local de prácticas contiene operaciones inválidas.');
  }
  return parsed as PendingPracticeSession[];
}

export async function readPendingPracticeSessions(userId: string): Promise<PendingPracticeSession[]> {
  try {
    return await readPendingPracticeSessionsStrict(userId);
  } catch (error) {
    devWarn('Could not read practice outbox for display; preserving stored data.', error);
    return [];
  }
}

async function writePendingPracticeSessions(userId: string, items: PendingPracticeSession[]) {
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

export async function enqueuePendingPractice(item: PendingPracticeSession) {
  return serializePracticeMutation(item.userId, async () => {
    const current = await readPendingPracticeSessionsStrict(item.userId);
    if (current.some((candidate) => candidate.clientEventId === item.clientEventId)) return;
    await writePendingPracticeSessions(item.userId, [...current, item]);
  });
}

export async function removePendingPractice(userId: string, clientEventId: string) {
  return serializePracticeMutation(userId, async () => {
    const current = await readPendingPracticeSessionsStrict(userId);
    await writePendingPracticeSessions(userId, current.filter((item) => item.clientEventId !== clientEventId));
  });
}

export async function replacePendingPractice(userId: string, next: PendingPracticeSession) {
  return serializePracticeMutation(userId, async () => {
    const current = await readPendingPracticeSessionsStrict(userId);
    await writePendingPracticeSessions(
      userId,
      current.map((item) => item.clientEventId === next.clientEventId ? next : item),
    );
  });
}
