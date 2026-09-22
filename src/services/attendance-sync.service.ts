import { devWarn } from '../lib/client-diagnostics';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_WRITE_TIMEOUT_MS,
  getErrorMessage,
  isLikelyNetworkError,
  withOperationTimeout,
} from '../utils/async.utils';
import { createKeyedInFlightCoalescer } from '../utils/keyed-async.utils';
import {
  discardAttendanceOperation,
  readAttendanceOutboxStrict,
  replaceAttendanceOperation,
  type AttendanceOutboxState,
  type PendingAttendanceOperation,
  type PendingClassAttendanceOperation,
  type PendingMemberVisitOperation,
} from './attendance-outbox.service';
import { registerMyMemberVisitFromQr } from './member-visits.service';
import type { RegisterAttendanceFromQrResult } from './program-attendance.service';

export type AttendanceSyncResult = {
  operationId: string;
  status: 'synced' | AttendanceOutboxState;
  message: string;
  outcome?: string;
  networkFailure?: boolean;
};

const coalesceAttendanceSync = createKeyedInFlightCoalescer<AttendanceSyncResult>();

async function registerQueuedClass(
  operation: PendingClassAttendanceOperation,
): Promise<RegisterAttendanceFromQrResult> {
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
  if (!first) {
    throw new Error('Supabase no devolvió resultado del registro de asistencia.');
  }
  return first as RegisterAttendanceFromQrResult;
}

async function syncOperationOnce(
  operation: PendingAttendanceOperation,
): Promise<AttendanceSyncResult> {
  try {
    if (operation.kind === 'class') {
      const result = await registerQueuedClass(operation);

      if (result.result === 'registered' || result.result === 'already_registered') {
        await discardAttendanceOperation(operation.userId, operation.id);
        return {
          operationId: operation.id,
          status: 'synced',
          outcome: result.result,
          message: result.message || 'Asistencia confirmada.',
        };
      }

      if (result.result === 'outside_window_confirmation_required') {
        const next: PendingClassAttendanceOperation = {
          ...operation,
          state: 'needs_confirmation',
          message: result.message || 'Confirma el registro fuera del horario habitual.',
        };
        await replaceAttendanceOperation(operation.userId, next);
        return {
          operationId: operation.id,
          status: 'needs_confirmation',
          message: next.message ?? '',
        };
      }

      const next: PendingClassAttendanceOperation = {
        ...operation,
        state: 'rejected',
        message: result.message || 'UCAPSA rechazó el registro.',
      };
      await replaceAttendanceOperation(operation.userId, next);
      return {
        operationId: operation.id,
        status: 'rejected',
        outcome: result.result,
        message: next.message ?? '',
      };
    }

    const result = await withOperationTimeout(
      registerMyMemberVisitFromQr(
        operation.token,
        operation.id,
        operation.capturedAt,
      ),
      DEFAULT_WRITE_TIMEOUT_MS,
      'attendance-outbox-member-visit',
    );

    if (result.result === 'registered' || result.result === 'already_registered') {
      await discardAttendanceOperation(operation.userId, operation.id);
      return {
        operationId: operation.id,
        status: 'synced',
        outcome: result.result,
        message: result.message || 'Visita de socio confirmada.',
      };
    }

    const next: PendingMemberVisitOperation = {
      ...operation,
      state: 'rejected',
      message: result.message || 'UCAPSA rechazó la visita.',
    };
    await replaceAttendanceOperation(operation.userId, next);
    return {
      operationId: operation.id,
      status: 'rejected',
      outcome: result.result,
      message: next.message ?? '',
    };
  } catch (error) {
    const networkFailure = isLikelyNetworkError(error);
    const message = networkFailure
      ? 'Guardado en este dispositivo. Se confirmará cuando vuelva la conexión.'
      : `Aún no se pudo sincronizar: ${getErrorMessage(error)}`;
    const next = {
      ...operation,
      state: 'pending' as const,
      message,
    };

    try {
      await replaceAttendanceOperation(operation.userId, next);
    } catch (metadataError) {
      // La operación original ya estaba persistida antes de intentar red.
      // Si falla actualizar sólo su mensaje local, no conviertas ese fallo
      // secundario en un bloqueo de toda la cola.
      devWarn(
        'Could not update attendance outbox retry metadata; preserving original operation.',
        metadataError,
      );
    }

    return {
      operationId: operation.id,
      status: 'pending',
      message,
      networkFailure,
    };
  }
}

function syncOperation(
  operation: PendingAttendanceOperation,
): Promise<AttendanceSyncResult> {
  const key = `${operation.userId}:${operation.id}`;
  return coalesceAttendanceSync(key, () => syncOperationOnce(operation));
}

export async function syncAttendanceOperation(
  userId: string,
  operationId: string,
): Promise<AttendanceSyncResult | null> {
  const operation = (await readAttendanceOutboxStrict(userId))
    .find((item) => item.id === operationId);
  if (!operation) return null;
  return syncOperation(operation);
}

export async function confirmPendingClassAttendance(
  userId: string,
  operationId: string,
): Promise<AttendanceSyncResult | null> {
  const operation = (await readAttendanceOutboxStrict(userId))
    .find((item) => item.id === operationId);
  if (!operation || operation.kind !== 'class') return null;

  const confirmed: PendingClassAttendanceOperation = {
    ...operation,
    confirmOutsideWindow: true,
    state: 'pending',
    message: null,
  };
  await replaceAttendanceOperation(userId, confirmed);
  return syncOperation(confirmed);
}

export async function flushPendingAttendanceOperations(userId: string): Promise<{
  synced: number;
  pending: number;
  needsConfirmation: number;
  rejected: number;
}> {
  const current = await readAttendanceOutboxStrict(userId);
  let synced = 0;

  for (const operation of current) {
    if (operation.state !== 'pending') continue;
    const result = await syncOperation(operation);
    if (result.status === 'synced') synced += 1;

    // Una caída de red sí justifica detener el lote; un error específico de
    // una operación no debe impedir que las posteriores intenten sincronizar.
    if (result.status === 'pending' && result.networkFailure) break;
  }

  const remaining = await readAttendanceOutboxStrict(userId);
  return {
    synced,
    pending: remaining.filter((item) => item.state === 'pending').length,
    needsConfirmation: remaining.filter(
      (item) => item.state === 'needs_confirmation',
    ).length,
    rejected: remaining.filter((item) => item.state === 'rejected').length,
  };
}
