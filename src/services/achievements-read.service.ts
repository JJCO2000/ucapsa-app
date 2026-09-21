import { PROGRAM_COMPLETION_ACHIEVEMENT_CODES } from '../constants/programCompletion';
import { supabase } from '../lib/supabase';
import {
  getCachedAchievementsForDog,
  getCachedAchievementsForUser,
  persistAchievementCache,
} from './achievements-cache.service';
import {
  mergeDefinitionsWithStoredAchievements,
  type AchievementDefinition,
  type AchievementWithState,
  type UserAchievement,
} from './achievements.domain';

const ACHIEVEMENT_QUERY_TIMEOUT_MS = 6000;

function normalizeDefinition(row: unknown): AchievementDefinition {
  return row as AchievementDefinition;
}

function normalizeAchievement(row: unknown): UserAchievement {
  return row as UserAchievement;
}

function withAchievementTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('achievement_query_timeout')),
      ACHIEVEMENT_QUERY_TIMEOUT_MS,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
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

export async function getAchievementsForUser(
  userId: string,
): Promise<AchievementWithState[]> {
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

export async function refreshAchievementsForUser(
  userId: string,
): Promise<AchievementWithState[]> {
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
