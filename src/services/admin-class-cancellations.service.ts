import { supabase } from '../lib/supabase';

export type SendClassCancellationNotificationInput = {
  scheduleIds: string[];
  cancellationDate: string;
  reason?: string | null;
};

export type SendClassCancellationNotificationResult = {
  campaign_id: string;
  cancellation_date: string;
  schedule_ids: string[];
  candidate_enrollments: number;
  total_targets: number;
  success_count: number;
  failure_count: number;
  status: 'sent' | 'partial_failed' | 'failed' | 'no_targets';
  message?: string;
};

export async function sendClassCancellationNotification(
  input: SendClassCancellationNotificationInput,
): Promise<SendClassCancellationNotificationResult> {
  const scheduleIds = [...new Set(input.scheduleIds.map((item) => item.trim()).filter(Boolean))];

  if (scheduleIds.length === 0) throw new Error('No hay clases para notificar.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cancellationDate)) {
    throw new Error('La fecha debe tener formato AAAA-MM-DD.');
  }

  const { data, error } = await supabase.functions.invoke('send-class-cancellation', {
    body: {
      schedule_ids: scheduleIds,
      cancellation_date: input.cancellationDate,
      reason: input.reason?.trim() || null,
    },
  });

  if (error) {
    let message = error.message ?? 'No se pudo enviar la notificacion de cancelacion.';

    try {
      const context = (error as { context?: Response }).context;
      const details = context ? await context.json() : null;

      if (details?.error) {
        message = details.error;
      } else if (details?.message) {
        message = details.message;
      }
    } catch (_parseError) {
      // Keep default message.
    }

    throw new Error(message);
  }

  return data as SendClassCancellationNotificationResult;
}
