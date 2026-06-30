import { supabase } from '../lib/supabase';
import type { AudienceType } from '../types/app.types';

export type AdminNotificationCategory = 'announcements_events' | 'classes' | 'membership' | 'achievements';

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
  status: 'sent' | 'partial_failed' | 'failed' | 'no_targets';
  message?: string;
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
};

export async function sendAdminNotification(input: SendAdminNotificationInput): Promise<SendAdminNotificationResult> {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) throw new Error('El titulo es obligatorio.');
  if (!body) throw new Error('El mensaje es obligatorio.');

  const { data, error } = await supabase.functions.invoke('send-notification', {
    body: {
      title,
      body,
      audience: input.audience,
      category: input.category,
    },
  });

  if (error) {
    let message = error.message ?? 'No se pudo enviar la notificacion.';

    try {
      const context = (error as { context?: Response }).context;
      const details = context ? await context.json() : null;

      console.log('send-notification details:', details);

      if (details?.error) {
        message = details.error;
      } else if (details?.message) {
        message = details.message;
      }
    } catch (parseError) {
      console.log('No se pudo leer el detalle del error:', parseError);
    }

    throw new Error(message);
  }

  return data as SendAdminNotificationResult;
}

export async function getAdminNotificationCampaigns(limit = 12): Promise<NotificationCampaign[]> {
  const { data, error } = await supabase
    .from('notification_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as NotificationCampaign[];
}

