import { supabase } from '../lib/supabase';
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

function getPriorityRank(priority: UcapsaPriority | null | undefined) {
  const ranks: Record<UcapsaPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  return ranks[priority ?? 'normal'] ?? ranks.normal;
}

function getAnnouncementTime(announcement: Announcement) {
  const value = announcement.announcement_date ?? announcement.created_at;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortAnnouncements(items: Announcement[]) {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return getAnnouncementTime(b) - getAnnouncementTime(a);
  });
}

export async function getVisibleAnnouncements(limit?: number): Promise<Announcement[]> {
  let query = supabase
    .from('announcements')
    .select('*, event:events(*)')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  return sortAnnouncements((data ?? []).map(normalizeAnnouncement));
}

export async function getAdminAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*, event:events(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return sortAnnouncements((data ?? []).map(normalizeAnnouncement));
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
    .insert(payload)
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
    .update(payload)
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



