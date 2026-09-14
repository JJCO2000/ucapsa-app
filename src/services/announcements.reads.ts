import { supabase } from '../lib/supabase';
import type { Announcement, UcapsaPriority } from '../types/app.types';

const HOME_ANNOUNCEMENT_WINDOW_DAYS = 14;
const HOME_UNDATED_RECENCY_DAYS = 7;
const MAX_HOME_ANNOUNCEMENT_CANDIDATES = 100;

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

// Lista general: conserva la semántica que existía antes del rediseño de Home.
function visibleAnnouncementDateKey(announcement: Announcement) {
  return dateKeyFromValue(announcement.announcement_date ?? announcement.event?.start_date ?? announcement.created_at);
}

function isCurrentVisibleAnnouncement(announcement: Announcement, now = new Date()) {
  const key = visibleAnnouncementDateKey(announcement);
  if (!key) return true;
  return !announcement.archived_at && key >= localDateKey(now);
}

function filterCurrentVisibleAnnouncements(items: Announcement[], now = new Date()) {
  return items.filter((announcement) => isCurrentVisibleAnnouncement(announcement, now));
}

// Home: una fecha de creación no convierte por sí sola un aviso en evento futuro.
function scheduledDateKey(announcement: Announcement) {
  return dateKeyFromValue(announcement.announcement_date ?? announcement.event?.start_date);
}

function isCurrentHomeAnnouncement(announcement: Announcement, now = new Date()) {
  const key = scheduledDateKey(announcement);
  if (!key) return !announcement.archived_at;
  return !announcement.archived_at && key >= localDateKey(now);
}

function getPriorityRank(priority: UcapsaPriority | null | undefined) {
  const ranks: Record<UcapsaPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  return ranks[priority ?? 'normal'] ?? ranks.normal;
}

function getCreatedTime(announcement: Announcement) {
  const time = new Date(announcement.created_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getVisibleAnnouncementTime(announcement: Announcement) {
  const value = announcement.announcement_date ?? announcement.created_at;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortVisibleAnnouncements(items: Announcement[]) {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return getVisibleAnnouncementTime(b) - getVisibleAnnouncementTime(a);
  });
}

function getScheduledTime(announcement: Announcement) {
  const value = announcement.announcement_date ?? announcement.event?.start_date;
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function sortHomeAnnouncementsByRelevance(items: Announcement[]) {
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
  if (!isCurrentHomeAnnouncement(announcement, now)) return false;
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
  return sortHomeAnnouncementsByRelevance(
    items.filter((announcement) => isHomeRelevantAnnouncement(announcement, now)),
  ).slice(0, Math.max(0, limit));
}

export async function getVisibleAnnouncements(limit?: number): Promise<Announcement[]> {
  let query = supabase
    .from('announcements')
    .select('*, event:events(*)')
    .eq('is_published', true)
    .is('archived_at', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (limit) query = query.limit(Math.max(limit * 3, limit));

  const { data, error } = await query;
  if (error) throw error;

  const current = filterCurrentVisibleAnnouncements((data ?? []).map(normalizeAnnouncement));
  const sorted = sortVisibleAnnouncements(current);
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function getHomeAnnouncements(limit = 1): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*, event:events(*)')
    .eq('is_published', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_HOME_ANNOUNCEMENT_CANDIDATES);

  if (error) throw error;
  return rankHomeAnnouncements((data ?? []).map(normalizeAnnouncement), limit);
}

export async function getAdminAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*, event:events(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return sortVisibleAnnouncements((data ?? []).map(normalizeAnnouncement));
}
