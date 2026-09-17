import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PROGRAM_COMPLETION_ACHIEVEMENT_CODES,
  getProgramCompletionAchievementCode,
  isProgramCompletionAchievementCode,
} from '../constants/programCompletion';
import { supabase } from '../lib/supabase';

export { getProgramCompletionAchievementCode };

export type AchievementDefinition = {
  code: string;
  title: string;
  description: string | null;
  unlocked_title: string;
  unlocked_description: string | null;
  icon: string;
  color_key: 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'gray';
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserAchievement = {
  id: string;
  user_id: string;
  dog_id: string | null;
  achievement_code: string;
  source_type: string | null;
  source_id: string | null;
  awarded_at: string;
  awarded_by: string | null;
  created_at: string;
};

export type AchievementWithState = {
  definition: AchievementDefinition;
  achievement: UserAchievement | null;
  unlocked: boolean;
  dogId: string | null;
  unlockSource?: 'stored' | 'program_completion' | null;
};

type AchievementCachePayload = {
  version: 2;
  user_id: string;
  dog_id: string | null;
  saved_at: string;
  items: AchievementWithState[];
};

const ACHIEVEMENT_CACHE_PREFIX = 'ucapsa:achievements:v2:';
const ACHIEVEMENT_QUERY_TIMEOUT_MS = 6000;
const memoryCache = new Map<string, AchievementWithState[]>();

function normalizeDefinition(row: unknown): AchievementDefinition {
  return row as AchievementDefinition;
}

function normalizeAchievement(row: unknown): UserAchievement {
  return row as UserAchievement;
}

function achievementScopeKey(userId: string, dogId: string | null) {
  return `${userId}:${dogId ?? 'all'}`;
}

function achievementCacheKey(userId: string, dogId: string | null) {
  return `${ACHIEVEMENT_CACHE_PREFIX}${achievementScopeKey(userId, dogId)}`;
}

function withAchievementTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('achievement_query_timeout')), ACHIEVEMENT_QUERY_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isCachedAchievementArray(value: unknown): value is AchievementWithState[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Partial<AchievementWithState>;
    return Boolean(
      candidate.definition &&
      typeof candidate.definition.code === 'string' &&
      typeof candidate.definition.title === 'string' &&
      typeof candidate.definition.icon === 'string' &&
      typeof candidate.unlocked === 'boolean',
    );
  });
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('No hay sesion activa.');
  return userId;
}

async function getAchievementDefinitions(): Promise<AchievementDefinition[]> {
  const { data, error } = await supabase
    .from('achievement_definitions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeDefinition);
}

function mergeDefinitionsWithStoredAchievements(
  definitions: AchievementDefinition[],
  achievements: UserAchievement[],
  dogId: string | null,
): AchievementWithState[] {
  const achievementByCode = new Map<string, UserAchievement>();
  for (const achievement of achievements) {
    if (!achievementByCode.has(achievement.achievement_code)) {
      achievementByCode.set(achievement.achievement_code, achievement);
    }
  }

  return definitions.map((definition) => {
    const achievement = achievementByCode.get(definition.code) ?? null;
    return {
      definition,
      achievement,
      unlocked: Boolean(achievement),
      dogId,
      unlockSource: achievement ? 'stored' : null,
    };
  });
}

async function persistAchievementCache(
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
  } catch {
    // La cache local es una mejora offline; nunca debe romper la consulta remota.
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
      parsed.version !== 2 ||
      parsed.user_id !== userId ||
      parsed.dog_id !== dogId ||
      !isCachedAchievementArray(parsed.items)
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    const normalizedItems = parsed.items.map((item) => ({ ...item, dogId: parsed.dog_id ?? null }));
    memoryCache.set(scopeKey, normalizedItems);
    return normalizedItems;
  } catch {
    return null;
  }
}

export async function getCachedAchievementsForUser(userId: string): Promise<AchievementWithState[] | null> {
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

export async function getAchievementsForUser(userId: string): Promise<AchievementWithState[]> {
  const [definitions, achievementResult] = await Promise.all([
    getAchievementDefinitions(),
    supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false }),
  ]);

  if (achievementResult.error) throw achievementResult.error;
  const achievements = (achievementResult.data ?? []).map(normalizeAchievement);
  return mergeDefinitionsWithStoredAchievements(definitions, achievements, null);
}

export async function getAchievementsForDog(
  userId: string,
  dogId: string,
): Promise<AchievementWithState[]> {
  const [definitions, achievementResult] = await Promise.all([
    getAchievementDefinitions(),
    supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .eq('dog_id', dogId)
      .order('awarded_at', { ascending: false }),
  ]);

  if (achievementResult.error) throw achievementResult.error;
  const achievements = (achievementResult.data ?? []).map(normalizeAchievement);
  const dogDefinitions = PROGRAM_COMPLETION_ACHIEVEMENT_CODES
    .map((code) => definitions.find((definition) => definition.code === code))
    .filter((definition): definition is AchievementDefinition => Boolean(definition));
  return mergeDefinitionsWithStoredAchievements(dogDefinitions, achievements, dogId);
}

export async function refreshAchievementsForUser(userId: string): Promise<AchievementWithState[]> {
  const rows = await withAchievementTimeout(getAchievementsForUser(userId));
  await persistAchievementCache(userId, null, rows);
  return rows;
}

export async function refreshAchievementsForDog(
  userId: string,
  dogId: string,
): Promise<AchievementWithState[]> {
  const rows = await withAchievementTimeout(getAchievementsForDog(userId, dogId));
  await persistAchievementCache(userId, dogId, rows);
  return rows;
}

export async function getMyAchievements(options?: {
  userId?: string;
  forceRefresh?: boolean;
  allowCachedOnError?: boolean;
}): Promise<AchievementWithState[]> {
  const userId = options?.userId ?? await getCurrentUserId();
  const forceRefresh = options?.forceRefresh ?? false;
  const allowCachedOnError = options?.allowCachedOnError ?? true;

  if (!forceRefresh) {
    const cached = await getCachedAchievementsForUser(userId);
    if (cached) return cached;
  }

  try {
    return await refreshAchievementsForUser(userId);
  } catch (error) {
    if (allowCachedOnError) {
      const cached = await getCachedAchievementsForUser(userId);
      if (cached) return cached;
    }
    throw error;
  }
}

export async function getMyDogAchievements(
  dogId: string,
  options?: {
    userId?: string;
    forceRefresh?: boolean;
    allowCachedOnError?: boolean;
  },
): Promise<AchievementWithState[]> {
  const userId = options?.userId ?? await getCurrentUserId();
  const forceRefresh = options?.forceRefresh ?? false;
  const allowCachedOnError = options?.allowCachedOnError ?? true;

  if (!forceRefresh) {
    const cached = await getCachedAchievementsForDog(userId, dogId);
    if (cached) return cached;
  }

  try {
    return await refreshAchievementsForDog(userId, dogId);
  } catch (error) {
    if (allowCachedOnError) {
      const cached = await getCachedAchievementsForDog(userId, dogId);
      if (cached) return cached;
    }
    throw error;
  }
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
    const matchingKeys = keys.filter((key) => key.startsWith(`${ACHIEVEMENT_CACHE_PREFIX}${userId}:`));
    if (matchingKeys.length > 0) await AsyncStorage.multiRemove(matchingKeys);
  } catch {
    // No bloquear una accion remota correcta por un fallo del almacenamiento local.
  }
}

export function countUnlockedAchievements(items: AchievementWithState[]) {
  return items.filter((item) => item.unlocked).length;
}

export async function awardAchievementToUser(userId: string, achievementCode: string): Promise<void> {
  const adminUserId = await getCurrentUserId();
  const { error } = await supabase
    .from('user_achievements')
    .upsert(
      {
        user_id: userId,
        dog_id: null,
        achievement_code: achievementCode,
        source_type: 'manual_admin',
        source_id: null,
        awarded_by: adminUserId,
      },
      { onConflict: 'user_id,achievement_code', ignoreDuplicates: true },
    );

  if (error) throw error;
  await clearAchievementCacheForUser(userId);
}

export async function revokeAchievementFromUser(userId: string, achievementCode: string): Promise<void> {
  const { error } = await supabase
    .from('user_achievements')
    .delete()
    .eq('user_id', userId)
    .eq('achievement_code', achievementCode)
    .is('dog_id', null);

  if (error) throw error;
  await clearAchievementCacheForUser(userId);
}

export function formatAchievementDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
