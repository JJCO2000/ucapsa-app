import type { PracticeDifficulty } from '../types/app.types';

export type PracticeActivityEntry = {
  id: string;
  clientEventId: string | null;
  dogId: string | null;
  dogName: string | null;
  enrollmentId: string | null;
  completedAt: string;
  difficulty: PracticeDifficulty;
  note: string | null;
  syncStatus: 'synced' | 'pending';
};

export type PracticeEngagementStats = {
  currentStreak: number;
  longestStreak: number;
  practicedToday: boolean;
  thisWeekCount: number;
  thisMonthCount: number;
  activeDaysThisMonth: number;
  lastPracticeAt: string | null;
  recentDays: Array<{ dateKey: string; label: string; practiced: boolean; isToday: boolean }>;
};

export type PracticeActivitySnapshot = {
  entries: PracticeActivityEntry[];
  stats: PracticeEngagementStats;
  source: 'remote' | 'cached' | 'local';
  savedAt: string | null;
};

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startOfLocalWeek(reference = new Date()) {
  const day = reference.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + diff,
    0,
    0,
    0,
    0,
  );
}

function dateKeyFromIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return localDateKey(date);
}

function dayBefore(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const value = new Date(year, month - 1, day, 12, 0, 0, 0);
  value.setDate(value.getDate() - 1);
  return localDateKey(value);
}

export function buildPracticeEngagementStats(
  entries: PracticeActivityEntry[],
  reference = new Date(),
): PracticeEngagementStats {
  const practicedDays = new Set(
    entries
      .map((item) => dateKeyFromIso(item.completedAt))
      .filter((value): value is string => Boolean(value)),
  );
  const today = reference;
  const todayKey = localDateKey(today);
  const yesterday = dayBefore(todayKey);
  const practicedToday = practicedDays.has(todayKey);

  let currentStreak = 0;
  let cursor = practicedToday ? todayKey : practicedDays.has(yesterday) ? yesterday : null;
  while (cursor && practicedDays.has(cursor)) {
    currentStreak += 1;
    cursor = dayBefore(cursor);
  }

  const sortedDays = [...practicedDays].sort();
  let longestStreak = 0;
  let running = 0;
  let previous: string | null = null;
  for (const key of sortedDays) {
    running = previous && dayBefore(key) === previous ? running + 1 : 1;
    longestStreak = Math.max(longestStreak, running);
    previous = key;
  }

  const weekStart = startOfLocalWeek(today).getTime();
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-`;
  const thisWeekCount = entries.filter((item) => {
    const time = new Date(item.completedAt).getTime();
    return Number.isFinite(time) && time >= weekStart;
  }).length;
  const thisMonthEntries = entries.filter((item) =>
    dateKeyFromIso(item.completedAt)?.startsWith(monthPrefix),
  );
  const activeDaysThisMonth = new Set(
    thisMonthEntries.map((item) => dateKeyFromIso(item.completedAt)).filter(Boolean),
  ).size;

  const recentDays: PracticeEngagementStats['recentDays'] = [];
  const dayLabels = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - offset,
      12,
      0,
      0,
      0,
    );
    const key = localDateKey(date);
    recentDays.push({
      dateKey: key,
      label: dayLabels[date.getDay()],
      practiced: practicedDays.has(key),
      isToday: key === todayKey,
    });
  }

  return {
    currentStreak,
    longestStreak,
    practicedToday,
    thisWeekCount,
    thisMonthCount: thisMonthEntries.length,
    activeDaysThisMonth,
    lastPracticeAt: entries[0]?.completedAt ?? null,
    recentDays,
  };
}
