import AsyncStorage from '@react-native-async-storage/async-storage';

export type PracticeTargetDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DEFAULT_PRACTICE_TARGET_DAYS: PracticeTargetDay[] = [1, 2, 3, 4, 5];

function key(userId: string) {
  return `ucapsa:practice-target-days:${userId}`;
}

function normalize(value: unknown): PracticeTargetDay[] {
  if (!Array.isArray(value)) return DEFAULT_PRACTICE_TARGET_DAYS;
  const unique = [...new Set(value.filter((item): item is PracticeTargetDay => Number.isInteger(item) && item >= 0 && item <= 6))].sort((a, b) => a - b);
  return unique.length > 0 ? unique : DEFAULT_PRACTICE_TARGET_DAYS;
}

export async function getPracticeTargetDays(userId: string): Promise<PracticeTargetDay[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return DEFAULT_PRACTICE_TARGET_DAYS;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_PRACTICE_TARGET_DAYS;
  }
}

export async function savePracticeTargetDays(userId: string, days: PracticeTargetDay[]): Promise<PracticeTargetDay[]> {
  const normalized = normalize(days);
  await AsyncStorage.setItem(key(userId), JSON.stringify(normalized));
  return normalized;
}

export async function togglePracticeTargetDay(userId: string, current: PracticeTargetDay[], day: PracticeTargetDay): Promise<PracticeTargetDay[]> {
  const next = current.includes(day) ? current.filter((item) => item !== day) : [...current, day];
  // Mantener al menos un dia objetivo para que la meta semanal siga teniendo sentido.
  if (next.length === 0) return current;
  return savePracticeTargetDays(userId, next);
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfWeek(now = new Date()) {
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);
}

export function getPracticeGoalProgress(completedAtValues: string[], targetDays: PracticeTargetDay[], now = new Date()) {
  const start = startOfWeek(now);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7, 0, 0, 0, 0);
  const practicedDateKeys = new Set<string>();

  for (const value of completedAtValues) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date < start || date >= end) continue;
    practicedDateKeys.add(localDateKey(date));
  }

  let completedTargets = 0;
  for (const weekday of targetDays) {
    const offset = weekday === 0 ? 6 : weekday - 1;
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12, 0, 0, 0);
    if (practicedDateKeys.has(localDateKey(date))) completedTargets += 1;
  }

  return {
    completedTargets,
    targetCount: Math.max(1, targetDays.length),
  };
}
