import AsyncStorage from '@react-native-async-storage/async-storage';

import { isProgramCompletionAchievementCode } from '../constants/programCompletion';
import { devWarn } from '../lib/client-diagnostics';
import type { AchievementWithState } from './achievements.domain';

type AchievementCachePayload = {
  version: 2;
  user_id: string;
  dog_id: string | null;
  saved_at: string;
  items: AchievementWithState[];
};

const ACHIEVEMENT_CACHE_PREFIX = 'ucapsa:achievements:v2:';
const memoryCache = new Map<string, AchievementWithState[]>();

function achievementScopeKey(userId: string, dogId: string | null) {
  return `${userId}:${dogId ?? 'all'}`;
}

function achievementCacheKey(userId: string, dogId: string | null) {
  return `${ACHIEVEMENT_CACHE_PREFIX}${achievementScopeKey(userId, dogId)}`;
}

function isCachedAchievementArray(value: unknown): value is AchievementWithState[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Partial<AchievementWithState>;
    return Boolean(
      candidate.definition
      && typeof candidate.definition.code === 'string'
      && typeof candidate.definition.title === 'string'
      && typeof candidate.definition.icon === 'string'
      && typeof candidate.unlocked === 'boolean',
    );
  });
}

export async function persistAchievementCache(
  userId: string,
  dogId: string | null,
  items: AchievementWithState[],
) {
  const scopeKey = achievementScopeKey(userId, dogId);
  memoryCache.set(scopeKey, items);

  const payload: AchievementCachePayload = {
    version: 2,
    user_id: userId,
    dog_id: dogId,
    saved_at: new Date().toISOString(),
    items,
  };

  try {
    await AsyncStorage.setItem(achievementCacheKey(userId, dogId), JSON.stringify(payload));
  } catch (error) {
    devWarn('Could not persist achievement cache.', error);
  }
}

async function getCachedAchievements(
  userId: string,
  dogId: string | null,
): Promise<AchievementWithState[] | null> {
  const scopeKey = achievementScopeKey(userId, dogId);
  const inMemory = memoryCache.get(scopeKey);
  if (inMemory) return inMemory;

  const key = achievementCacheKey(userId, dogId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AchievementCachePayload>;
    if (
      parsed.version !== 2
      || parsed.user_id !== userId
      || parsed.dog_id !== dogId
      || !isCachedAchievementArray(parsed.items)
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    const normalizedItems = parsed.items.map((item) => ({
      ...item,
      dogId: parsed.dog_id ?? null,
    }));
    memoryCache.set(scopeKey, normalizedItems);
    return normalizedItems;
  } catch (error) {
    devWarn('Could not read achievement cache.', error);
    return null;
  }
}

export async function getCachedAchievementsForUser(
  userId: string,
): Promise<AchievementWithState[] | null> {
  return getCachedAchievements(userId, null);
}

export async function getCachedAchievementsForDog(
  userId: string,
  dogId: string,
): Promise<AchievementWithState[] | null> {
  const cached = await getCachedAchievements(userId, dogId);
  if (!cached) return null;
  return cached
    .filter((item) => isProgramCompletionAchievementCode(item.definition.code))
    .map((item) => ({ ...item, dogId }));
}

export function clearAchievementCache() {
  memoryCache.clear();
}

export async function clearAchievementCacheForUser(userId: string) {
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(`${userId}:`)) memoryCache.delete(key);
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    const matchingKeys = keys.filter((key) =>
      key.startsWith(`${ACHIEVEMENT_CACHE_PREFIX}${userId}:`),
    );
    if (matchingKeys.length > 0) await AsyncStorage.multiRemove(matchingKeys);
  } catch (error) {
    devWarn('Could not clear achievement cache.', error);
  }
}
