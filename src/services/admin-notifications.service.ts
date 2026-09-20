import { supabase } from '../lib/supabase';
import type { AudienceType } from '../types/app.types';

export type AdminNotificationCategory = 'announcements_events' | 'classes' | 'membership' | 'achievements';

export const ADMIN_NOTIFICATION_TITLE_MAX_LENGTH = 80;
export const ADMIN_NOTIFICATION_BODY_MAX_LENGTH = 180;

export type SendAdminNotificationInput = {
  title: string;
  body: string;
  audience: AudienceType;
  category: AdminNotificationCategory;
};

export type SendAdminNotificationResult = {
  campaign_id: string;
  total_targets: number;
  success_count: number;
  failure_count: number;
  status: 'sending' | 'sent' | 'partial_failed' | 'failed' | 'no_targets';
  message?: string;
  reused?: boolean;
};

export type NotificationCampaign = {
  id: string;
  title: string;
  body: string;
  audience: AudienceType;
  category: AdminNotificationCategory;
  status: 'draft' | 'sending' | 'sent' | 'partial_failed' | 'failed' | 'no_targets';
  total_targets: number;
  success_count: number;
  failure_count: number;
  created_by: string | null;
  sent_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

function normalizeInput(input: SendAdminNotificationInput) {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) throw new Error('El titulo es obligatorio.');
  if (title.length > ADMIN_NOTIFICATION_TITLE_MAX_LENGTH) {
    throw new Error(`El titulo no puede exceder ${ADMIN_NOTIFICATION_TITLE_MAX_LENGTH} caracteres.`);
  }

  if (!body) throw new Error('El mensaje es obligatorio.');
  if (body.length > ADMIN_NOTIFICATION_BODY_MAX_LENGTH) {
    throw new Error(`El mensaje no puede exceder ${ADMIN_NOTIFICATION_BODY_MAX_LENGTH} caracteres.`);
  }

  return {
    title,
    body,
    audience: input.audience,
    category: input.category,
  };
}

async function invokePreparedCampaign(campaignId: string): Promise<SendAdminNotificationResult> {
  const { data, error } = await supabase.functions.invoke('send-notification', {
    body: {
      campaign_id: campaignId,
    },
  });

  if (error) {
    let message = error.message ?? 'No se pudo enviar la notificacion.';

    try {
      const context = (error as { context?: Response }).context;
      const details = context ? await context.json() : null;

      if (details?.error) {
        message = details.error;
      } else if (details?.message) {
        message = details.message;
      }
    } catch {
      // Keep the original Edge Function error message when the response body cannot be parsed.
    }

    throw new Error(message);
  }

  return data as SendAdminNotificationResult;
}

export async function prepareAdminNotification(input: SendAdminNotificationInput): Promise<NotificationCampaign> {
  const normalized = normalizeInput(input);

  const { data, error } = await supabase.rpc('admin_prepare_notification_campaign', {
    p_title: normalized.title,
    p_body: normalized.body,
    p_audience: normalized.audience,
    p_category: normalized.category,
    p_reuse_recent: false,
  });

  if (error) throw error;
  if (!data) throw new Error('No se pudo preparar la notificacion.');

  return data as NotificationCampaign;
}

export async function sendPreparedAdminNotification(campaignId: string): Promise<SendAdminNotificationResult> {
  const id = campaignId.trim();
  if (!id) throw new Error('Falta la campana preparada.');

  return invokePreparedCampaign(id);
}

/**
 * Compatibilidad para consumidores que no necesitan conservar el campaign id
 * entre reintentos. La pantalla admin usa explícitamente prepare + sendPrepared.
 */
export async function sendAdminNotification(input: SendAdminNotificationInput): Promise<SendAdminNotificationResult> {
  const campaign = await prepareAdminNotification(input);
  return sendPreparedAdminNotification(campaign.id);
}

export async function getAdminNotificationCampaigns(limit = 3): Promise<NotificationCampaign[]> {
  const { data, error } = await supabase
    .from('notification_campaigns')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as NotificationCampaign[];
}

export async function deleteAdminNotificationCampaign(campaignId: string): Promise<void> {
  const { error } = await supabase
    .from('notification_campaigns')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', campaignId);

  if (error) throw error;
}
