import { supabase } from '../lib/supabase';
import type { TableInsert, TableUpdate } from '../types/database.helpers';
import type { Announcement, AudienceType, UcapsaColorKey, UcapsaPriority } from '../types/app.types';

export type AnnouncementFormInput = {
  title: string;
  content: string;
  audience: AudienceType;
  is_pinned?: boolean;
  is_published?: boolean;
  event_id?: string | null;
  announcement_date?: string | null;
  color_key?: UcapsaColorKey | null;
  priority?: UcapsaPriority | null;
};

function normalizeAnnouncement(announcement: unknown): Announcement {
  return announcement as Announcement;
}

export async function createAnnouncement(input: AnnouncementFormInput): Promise<Announcement> {
  const { data: userResult } = await supabase.auth.getUser();

  const payload = {
    title: input.title.trim(),
    content: input.content.trim(),
    audience: input.audience,
    is_pinned: input.is_pinned ?? false,
    is_published: input.is_published ?? true,
    event_id: input.event_id || null,
    announcement_date: input.announcement_date || null,
    color_key: input.color_key ?? 'red',
    priority: input.priority ?? 'normal',
    created_by: userResult.user?.id ?? null,
  };

  const { data, error } = await supabase
    .from('announcements')
    .insert(payload as TableInsert<'announcements'>)
    .select('*, event:events(*)')
    .single();

  if (error) throw error;
  return normalizeAnnouncement(data);
}

export async function updateAnnouncement(
  announcementId: string,
  input: Partial<AnnouncementFormInput>,
): Promise<Announcement> {
  const payload: Record<string, unknown> = {};

  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.content !== undefined) payload.content = input.content.trim();
  if (input.audience !== undefined) payload.audience = input.audience;
  if (input.is_pinned !== undefined) payload.is_pinned = input.is_pinned;
  if (input.is_published !== undefined) payload.is_published = input.is_published;
  if (input.event_id !== undefined) payload.event_id = input.event_id || null;
  if (input.announcement_date !== undefined) payload.announcement_date = input.announcement_date || null;
  if (input.color_key !== undefined) payload.color_key = input.color_key ?? 'red';
  if (input.priority !== undefined) payload.priority = input.priority ?? 'normal';

  const { data, error } = await supabase
    .from('announcements')
    .update(payload as TableUpdate<'announcements'>)
    .eq('id', announcementId)
    .select('*, event:events(*)')
    .single();

  if (error) throw error;
  return normalizeAnnouncement(data);
}

export async function setAnnouncementPublished(
  announcementId: string,
  isPublished: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({ is_published: isPublished })
    .eq('id', announcementId);

  if (error) throw error;
}

export async function archiveAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', announcementId);

  if (error) throw error;
}

export async function restoreAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({ archived_at: null })
    .eq('id', announcementId);

  if (error) throw error;
}

export async function deleteAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', announcementId);

  if (error) throw error;
}
