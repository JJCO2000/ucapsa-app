import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { registerMyMemberVisitFromQr } from './member-visits.service';
import type { RegisterAttendanceFromQrResult } from './programs.service';
import {
  DEFAULT_WRITE_TIMEOUT_MS,
  getErrorMessage,
  isLikelyNetworkError,
  withOperationTimeout,
} from '../utils/async.utils';
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

export type PendingAttendanceOperation = PendingClassAttendanceOperation | PendingMemberVisitOperation;

export type AttendanceSyncResult = {
  operationId: string;
  status: 'synced' | AttendanceOutboxState;
  message: string;
};

const ATTENDANCE_OUTBOX_PREFIX = 'ucapsa:attendance-outbox:v1:';
const outboxMutationChains = new Map<string, Promise<unknown>>();
const syncInFlightByOperation = new Map<string, Promise<AttendanceSyncResult>>();

function outboxKey(userId: string) {
  return `${ATTENDANCE_OUTBOX_PREFIX}${userId}`;
}

function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isValidOperation(value: unknown, userId: string): value is PendingAttendanceOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<PendingAttendanceOperation>;
  if (
    item.version !== 1 ||
    item.userId !== userId ||
    typeof item.id !== 'string' ||
    typeof item.capturedAt !== 'string' ||
    (item.state !== 'pending' && item.state !== 'needs_confirmation' && item.state !== 'rejected') ||
    typeof item.token !== 'string'
  ) return false;

  if (item.kind === 'class') {
    return typeof item.enrollmentId === 'string' && typeof item.confirmOutsideWindow === 'boolean';
  }
  return item.kind === 'member_visit';
}

export async function getPendingAttendanceOperations(userId: string): Promise<PendingAttendanceOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => isValidOperation(item, userId));
  } catch {
    return [];
  }
}

async function writeOutbox(userId: string, items: PendingAttendanceOperation[]) {
  try {
    if (items.length === 0) {
      await AsyncStorage.removeItem(outboxKey(userId));
      return;
    }
    await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(items));
  } catch (error) {
    throw new Error(`No se pudo guardar el registro pendiente en este dispositivo: ${getErrorMessage(error)}`);
  }
}

function serializeOutboxMutation<T>(userId: string, mutation: () => Promise<T>): Promise<T> {
  const previous = outboxMutationChains.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(mutation);
  outboxMutationChains.set(userId, current);

  current.then(
    () => {
      if (outboxMutationChains.get(userId) === current) outboxMutationChains.delete(userId);
    },
    () => {
      if (outboxMutationChains.get(userId) === current) outboxMutationChains.delete(userId);
    },
  );

  return current;
}

async function replaceOperation(userId: string, next: PendingAttendanceOperation) {
  return serializeOutboxMutation(userId, async () => {
    const current = await getPendingAttendanceOperations(userId);
    await writeOutbox(userId, current.map((item) => item.id === next.id ? next : item));
  });
}

export async function discardAttendanceOperation(userId: string, operationId: string) {
  return serializeOutboxMutation(userId, async () => {
    const current = await getPendingAttendanceOperations(userId);
    await writeOutbox(userId, current.filter((item) => item.id !== operationId));
  });
}

export async function clearAttendanceOutbox(userId: string): Promise<void> {
  await serializeOutboxMutation(userId, async () => {
    try {
      await AsyncStorage.removeItem(outboxKey(userId));
    } catch {
      // No bloquear un borrado explícito por un fallo de almacenamiento local.
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
    const current = await getPendingAttendanceOperations(input.userId);
    const dateKey = localDateKey(capturedAt);
    const existing = current.find((item): item is PendingClassAttendanceOperation => (
      item.kind === 'class'
      && item.enrollmentId === input.enrollmentId
      && localDateKey(item.capturedAt) === dateKey
      && item.state !== 'rejected'
    ));
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
    const current = await getPendingAttendanceOperations(input.userId);
    const operation: PendingMemberVisitOperation = {
      version: 1,
      id: createOfflineUuid('member-visit'),
      userId: input.userId,
      kind: 'member_visit',
      token: input.token.trim(),
      capturedAt: new Date().toISOString(),
      state: 'pending',
      message: null,
    };
    await writeOutbox(input.userId, [...current, operation]);
    return operation;
  });
}

async function registerQueuedClass(operation: PendingClassAttendanceOperation): Promise<RegisterAttendanceFromQrResult> {
  const response = await withOperationTimeout(
    supabase.rpc('register_program_attendance_from_qr', {
      p_qr_token: operation.token,
      p_enrollment_id: operation.enrollmentId,
      p_confirm_outside_window: operation.confirmOutsideWindow,
      p_client_event_id: operation.id,
      p_captured_at: operation.capturedAt,
    }),
    DEFAULT_WRITE_TIMEOUT_MS,
    'attendance-outbox-class',
  );

  if (response.error) throw response.error;
  const first = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!first) throw new Error('Supabase no devolvió resultado del registro de asistencia.');
  return first as RegisterAttendanceFromQrResult;
}

async function syncOperationOnce(operation: PendingAttendanceOperation): Promise<AttendanceSyncResult> {
  try {
    if (operation.kind === 'class') {
      const result = await registerQueuedClass(operation);

      if (result.result === 'registered' || result.result === 'already_registered') {
        await discardAttendanceOperation(operation.userId, operation.id);
        return {
          operationId: operation.id,
          status: 'synced',
          message: result.message || 'Asistencia confirmada.',
        };
      }

      if (result.result === 'outside_window_confirmation_required') {
        const next: PendingClassAttendanceOperation = {
          ...operation,
          state: 'needs_confirmation',
          message: result.message || 'Confirma el registro fuera del horario habitual.',
        };
        await replaceOperation(operation.userId, next);
        return { operationId: operation.id, status: 'needs_confirmation', message: next.message ?? '' };
      }

      const next: PendingClassAttendanceOperation = {
        ...operation,
        state: 'rejected',
        message: result.message || 'UCAPSA rechazó el registro.',
      };
      await replaceOperation(operation.userId, next);
      return { operationId: operation.id, status: 'rejected', message: next.message ?? '' };
    }

    const result = await withOperationTimeout(
      registerMyMemberVisitFromQr(operation.token, operation.id, operation.capturedAt),
      DEFAULT_WRITE_TIMEOUT_MS,
      'attendance-outbox-member-visit',
    );

    if (result.result === 'registered' || result.result === 'already_registered') {
      await discardAttendanceOperation(operation.userId, operation.id);
      return {
        operationId: operation.id,
        status: 'synced',
        message: result.message || 'Visita de socio confirmada.',
      };
    }

    const next: PendingMemberVisitOperation = {
      ...operation,
      state: 'rejected',
      message: result.message || 'UCAPSA rechazó la visita.',
    };
    await replaceOperation(operation.userId, next);
    return { operationId: operation.id, status: 'rejected', message: next.message ?? '' };
  } catch (error) {
    const message = isLikelyNetworkError(error)
      ? 'Guardado en este dispositivo. Se confirmará cuando vuelva la conexión.'
      : `Aún no se pudo sincronizar: ${getErrorMessage(error)}`;
    const next = { ...operation, state: 'pending' as const, message };
    await replaceOperation(operation.userId, next);
    return { operationId: operation.id, status: 'pending', message };
  }
}

function syncOperation(operation: PendingAttendanceOperation): Promise<AttendanceSyncResult> {
  const key = `${operation.userId}:${operation.id}`;
  const inFlight = syncInFlightByOperation.get(key);
  if (inFlight) return inFlight;

  const current = syncOperationOnce(operation);
  syncInFlightByOperation.set(key, current);
  current.then(
    () => {
      if (syncInFlightByOperation.get(key) === current) syncInFlightByOperation.delete(key);
    },
    () => {
      if (syncInFlightByOperation.get(key) === current) syncInFlightByOperation.delete(key);
    },
  );
  return current;
}

export async function syncAttendanceOperation(
  userId: string,
  operationId: string,
): Promise<AttendanceSyncResult | null> {
  const operation = (await getPendingAttendanceOperations(userId)).find((item) => item.id === operationId);
  if (!operation) return null;
  return syncOperation(operation);
}

export async function confirmPendingClassAttendance(
  userId: string,
  operationId: string,
): Promise<AttendanceSyncResult | null> {
  const operation = (await getPendingAttendanceOperations(userId)).find((item) => item.id === operationId);
  if (!operation || operation.kind !== 'class') return null;
  const confirmed: PendingClassAttendanceOperation = {
    ...operation,
    confirmOutsideWindow: true,
    state: 'pending',
    message: null,
  };
  await replaceOperation(userId, confirmed);
  return syncOperation(confirmed);
}

export async function flushPendingAttendanceOperations(userId: string): Promise<{
  synced: number;
  pending: number;
  needsConfirmation: number;
  rejected: number;
}> {
  const current = await getPendingAttendanceOperations(userId);
  let synced = 0;

  for (const operation of current) {
    if (operation.state !== 'pending') continue;
    const result = await syncOperation(operation);
    if (result.status === 'synced') synced += 1;
    if (result.status === 'pending') break;
  }

  const remaining = await getPendingAttendanceOperations(userId);
  return {
    synced,
    pending: remaining.filter((item) => item.state === 'pending').length,
    needsConfirmation: remaining.filter((item) => item.state === 'needs_confirmation').length,
    rejected: remaining.filter((item) => item.state === 'rejected').length,
  };
}
