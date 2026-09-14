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

const HOME_ANNOUNCEMENT_WINDOW_DAYS = 14;
const HOME_UNDATED_RECENCY_DAYS = 7;
const MAX_VISIBLE_ANNOUNCEMENTS = 100;

function normalizeAnnouncement(announcement: unknown): Announcement {
  return announcement as Announcement;
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateKeyFromValue(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return localDateKey(date);
}

function scheduledDateKey(announcement: Announcement) {
  return dateKeyFromValue(announcement.announcement_date ?? announcement.event?.start_date);
}

function isCurrentAnnouncement(announcement: Announcement, now = new Date()) {
  const key = scheduledDateKey(announcement);
  if (!key) return !announcement.archived_at;
  return !announcement.archived_at && key >= localDateKey(now);
}

function filterCurrentAnnouncements(items: Announcement[], now = new Date()) {
  return items.filter((announcement) => isCurrentAnnouncement(announcement, now));
}

function getPriorityRank(priority: UcapsaPriority | null | undefined) {
  const ranks: Record<UcapsaPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  return ranks[priority ?? 'normal'] ?? ranks.normal;
}

function getCreatedTime(announcement: Announcement) {
  const time = new Date(announcement.created_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getScheduledTime(announcement: Announcement) {
  const value = announcement.announcement_date ?? announcement.event?.start_date;
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function sortAnnouncementsByRelevance(items: Announcement[]) {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const aScheduled = getScheduledTime(a);
    const bScheduled = getScheduledTime(b);
    if (aScheduled !== bScheduled) return aScheduled - bScheduled;

    return getCreatedTime(b) - getCreatedTime(a);
  });
}

function daysBetweenDateKeys(fromKey: string, toKey: string) {
  const [fromYear, fromMonth, fromDay] = fromKey.split('-').map(Number);
  const [toYear, toMonth, toDay] = toKey.split('-').map(Number);
  const from = new Date(fromYear, fromMonth - 1, fromDay, 12, 0, 0, 0).getTime();
  const to = new Date(toYear, toMonth - 1, toDay, 12, 0, 0, 0).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function isHomeRelevantAnnouncement(announcement: Announcement, now = new Date()) {
  if (!isCurrentAnnouncement(announcement, now)) return false;
  if (announcement.is_pinned || announcement.priority === 'urgent' || announcement.priority === 'high') return true;

  const today = localDateKey(now);
  const scheduled = scheduledDateKey(announcement);
  if (scheduled) {
    const daysAway = daysBetweenDateKeys(today, scheduled);
    return daysAway >= 0 && daysAway <= HOME_ANNOUNCEMENT_WINDOW_DAYS;
  }

  const createdAt = new Date(announcement.created_at).getTime();
  if (!Number.isFinite(createdAt)) return false;
  const ageDays = (now.getTime() - createdAt) / (24 * 60 * 60 * 1000);
  return ageDays >= 0 && ageDays <= HOME_UNDATED_RECENCY_DAYS;
}

export function rankHomeAnnouncements(items: Announcement[], limit = 1, now = new Date()) {
  return sortAnnouncementsByRelevance(items.filter((announcement) => isHomeRelevantAnnouncement(announcement, now))).slice(0, Math.max(0, limit));
}

export async function getVisibleAnnouncements(limit?: number): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*, event:events(*)')
    .eq('is_published', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_VISIBLE_ANNOUNCEMENTS);

  if (error) throw error;
  const current = filterCurrentAnnouncements((data ?? []).map(normalizeAnnouncement));
  const sorted = sortAnnouncementsByRelevance(current);
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function getHomeAnnouncements(limit = 1): Promise<Announcement[]> {
  const visible = await getVisibleAnnouncements();
  return rankHomeAnnouncements(visible, limit);
}

export async function getAdminAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*, event:events(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeAnnouncement);
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
