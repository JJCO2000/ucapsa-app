import { supabase } from '../lib/supabase';

export type AnnouncementReminderSetting = {
  days_before: number;
  hour: number;
  minute: number;
  remind_at?: string;
  status?: string;
};

export type SaveAnnouncementRemindersInput = {
  announcement_id: string;
  reminders: AnnouncementReminderSetting[];
};

function normalizeSettings(value: unknown): AnnouncementReminderSetting[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item as Partial<AnnouncementReminderSetting>)
    .filter((item) => Number.isFinite(Number(item.days_before)))
    .map((item) => ({
      days_before: Math.max(0, Math.min(60, Number(item.days_before ?? 0))),
      hour: Math.max(0, Math.min(23, Number(item.hour ?? 9))),
      minute: Math.max(0, Math.min(59, Number(item.minute ?? 0))),
      remind_at: typeof item.remind_at === 'string' ? item.remind_at : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
    }));
}

function campaignRowsToSettings(rows: Array<{ status: string | null; metadata: unknown }> | null | undefined) {
  return normalizeSettings((rows ?? []).map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    return { ...metadata, status: row.status ?? undefined };
  }));
}

export async function getAnnouncementReminders(announcementId: string) {
  const { data, error } = await supabase
    .from('notification_campaigns')
    .select('status,metadata,created_at')
    .eq('category', 'announcements_events')
    .eq('status', 'draft')
    .contains('metadata', { source: 'announcement_reminder', announcement_id: announcementId })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return campaignRowsToSettings(data);
}

export async function saveAnnouncementReminders(input: SaveAnnouncementRemindersInput) {
  const { data, error } = await supabase.rpc('admin_replace_announcement_reminders', {
    p_announcement_id: input.announcement_id,
    p_reminders: input.reminders,
  });

  if (error) throw error;
  return campaignRowsToSettings(data);
}
