import AsyncStorage from '@react-native-async-storage/async-storage';

import { devWarn } from '../lib/client-diagnostics';
import { getErrorMessage } from '../utils/async.utils';
import { createKeyedMutationSerializer } from '../utils/keyed-async.utils';
import { createOfflineUuid } from '../utils/offline-id.utils';

export type AttendanceOutboxState = 'pending' | 'needs_confirmation' | 'rejected';

type AttendanceOutboxBase = {
  version: 1;
  id: string;
  userId: string;
  capturedAt: string;
  state: AttendanceOutboxState;
  message: string | null;
};

export type PendingClassAttendanceOperation = AttendanceOutboxBase & {
  kind: 'class';
  token: string;
  enrollmentId: string;
  confirmOutsideWindow: boolean;
};

export type PendingMemberVisitOperation = AttendanceOutboxBase & {
  kind: 'member_visit';
  token: string;
};

export type PendingAttendanceOperation =
  | PendingClassAttendanceOperation
  | PendingMemberVisitOperation;

const ATTENDANCE_OUTBOX_PREFIX = 'ucapsa:attendance-outbox:v1:';
const serializeOutboxMutation = createKeyedMutationSerializer();

function outboxKey(userId: string) {
  return `${ATTENDANCE_OUTBOX_PREFIX}${userId}`;
}

function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isValidOperation(
  value: unknown,
  userId: string,
): value is PendingAttendanceOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<PendingAttendanceOperation>;
  if (
    item.version !== 1
    || item.userId !== userId
    || typeof item.id !== 'string'
    || typeof item.capturedAt !== 'string'
    || (
      item.state !== 'pending'
      && item.state !== 'needs_confirmation'
      && item.state !== 'rejected'
    )
    || typeof item.token !== 'string'
  ) return false;

  if (item.kind === 'class') {
    return (
      typeof item.enrollmentId === 'string'
      && typeof item.confirmOutsideWindow === 'boolean'
    );
  }
  return item.kind === 'member_visit';
}

export async function readAttendanceOutboxStrict(
  userId: string,
): Promise<PendingAttendanceOperation[]> {
  const raw = await AsyncStorage.getItem(outboxKey(userId));
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('La cola local de asistencias tiene un formato inválido.');
  }
  if (!parsed.every((item) => isValidOperation(item, userId))) {
    throw new Error('La cola local de asistencias contiene operaciones inválidas.');
  }
  return parsed as PendingAttendanceOperation[];
}

export async function getPendingAttendanceOperations(
  userId: string,
): Promise<PendingAttendanceOperation[]> {
  try {
    return await readAttendanceOutboxStrict(userId);
  } catch (error) {
    devWarn(
      'Could not read attendance outbox for display; preserving stored data.',
      error,
    );
    return [];
  }
}

async function writeOutbox(
  userId: string,
  items: PendingAttendanceOperation[],
) {
  try {
    if (items.length === 0) {
      await AsyncStorage.removeItem(outboxKey(userId));
      return;
    }
    await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(items));
  } catch (error) {
    throw new Error(
      `No se pudo guardar el registro pendiente en este dispositivo: ${getErrorMessage(error)}`,
    );
  }
}

export async function replaceAttendanceOperation(
  userId: string,
  next: PendingAttendanceOperation,
) {
  return serializeOutboxMutation(userId, async () => {
    const current = await readAttendanceOutboxStrict(userId);
    await writeOutbox(
      userId,
      current.map((item) => item.id === next.id ? next : item),
    );
  });
}

export async function discardAttendanceOperation(
  userId: string,
  operationId: string,
) {
  return serializeOutboxMutation(userId, async () => {
    const current = await readAttendanceOutboxStrict(userId);
    await writeOutbox(
      userId,
      current.filter((item) => item.id !== operationId),
    );
  });
}

export async function clearAttendanceOutbox(userId: string): Promise<void> {
  await serializeOutboxMutation(userId, async () => {
    try {
      await AsyncStorage.removeItem(outboxKey(userId));
    } catch (error) {
      devWarn('Could not clear attendance outbox.', error);
    }
  });
}

export async function queueClassAttendance(input: {
  userId: string;
  token: string;
  enrollmentId: string;
  confirmOutsideWindow?: boolean;
}): Promise<PendingClassAttendanceOperation> {
  return serializeOutboxMutation(input.userId, async () => {
    const capturedAt = new Date().toISOString();
    const current = await readAttendanceOutboxStrict(input.userId);
    const dateKey = localDateKey(capturedAt);
    const existing = current.find(
      (item): item is PendingClassAttendanceOperation => (
        item.kind === 'class'
        && item.enrollmentId === input.enrollmentId
        && localDateKey(item.capturedAt) === dateKey
        && item.state !== 'rejected'
      ),
    );
    if (existing) return existing;

    const operation: PendingClassAttendanceOperation = {
      version: 1,
      id: createOfflineUuid('attendance-class'),
      userId: input.userId,
      kind: 'class',
      token: input.token.trim(),
      enrollmentId: input.enrollmentId,
      confirmOutsideWindow: input.confirmOutsideWindow ?? false,
      capturedAt,
      state: 'pending',
      message: null,
    };
    await writeOutbox(input.userId, [...current, operation]);
    return operation;
  });
}

export async function queueMemberVisit(input: {
  userId: string;
  token: string;
}): Promise<PendingMemberVisitOperation> {
  return serializeOutboxMutation(input.userId, async () => {
    const capturedAt = new Date().toISOString();
    const current = await readAttendanceOutboxStrict(input.userId);
    const dateKey = localDateKey(capturedAt);
    const existing = current.find(
      (item): item is PendingMemberVisitOperation => (
        item.kind === 'member_visit'
        && localDateKey(item.capturedAt) === dateKey
        && item.state !== 'rejected'
      ),
    );
    if (existing) return existing;

    const operation: PendingMemberVisitOperation = {
      version: 1,
      id: createOfflineUuid('member-visit'),
      userId: input.userId,
      kind: 'member_visit',
      token: input.token.trim(),
      capturedAt,
      state: 'pending',
      message: null,
    };
    await writeOutbox(input.userId, [...current, operation]);
    return operation;
  });
}
