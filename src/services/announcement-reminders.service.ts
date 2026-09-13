import { supabase } from '../lib/supabase';
import type { AudienceType } from '../types/app.types';

export type AnnouncementReminderSetting = {
  days_before: number;
  hour: number;
  minute: number;
  remind_at?: string;
  status?: string;
};

export type SaveAnnouncementRemindersInput = {
  announcement_id: string;
  announcement_date: string;
  title: string;
  body: string;
  audience: AudienceType;
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

export async function getAnnouncementReminders(announcementId: string) {
  const { data, error } = await supabase.functions.invoke('send-announcement-reminders', {
    body: { action: 'list', announcement_id: announcementId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return normalizeSettings(data?.reminders);
}

export async function saveAnnouncementReminders(input: SaveAnnouncementRemindersInput) {
  const { data, error } = await supabase.functions.invoke('send-announcement-reminders', {
    body: {
      action: 'save',
      announcement_id: input.announcement_id,
      announcement_date: input.announcement_date,
      title: input.title,
      body: input.body,
      audience: input.audience,
      reminders: input.reminders,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return normalizeSettings(data?.reminders);
}
