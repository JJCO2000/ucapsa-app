import AsyncStorage from '@react-native-async-storage/async-storage';

import { getProgramCompletionAchievementCode } from '../constants/programCompletion';
import { supabase } from '../lib/supabase';
import type { TableRow } from '../types/database.helpers';

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
  unlockSource?: 'stored' | 'program_completion' | null;
};

type AchievementCachePayload = {
  version: 1;
  user_id: string;
  saved_at: string;
  items: AchievementWithState[];
};

const ACHIEVEMENT_CACHE_PREFIX = 'ucapsa:achievements:v1:';
const ACHIEVEMENT_QUERY_TIMEOUT_MS = 6000;
let cachedAchievementsUserId: string | null = null;
let cachedAchievements: AchievementWithState[] | null = null;

function normalizeDefinition(row: unknown): AchievementDefinition {
  return row as AchievementDefinition;
}

function normalizeAchievement(row: unknown): UserAchievement {
  return row as UserAchievement;
}

function achievementCacheKey(userId: string) {
  return `${ACHIEVEMENT_CACHE_PREFIX}${userId}`;
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

type CompletedProgramEvidence = {
  id: string;
  program_id: string;
  program_level: string;
  completed_at: string | null;
  updated_at: string;
  created_at: string;
};

async function getCompletedProgramAchievementEvidence(userId: string): Promise<Map<string, UserAchievement>> {
  const { data: completedRows, error: completedError } = await supabase
    .from('program_enrollments')
    .select('id, program_id, program_level, completed_at, updated_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'completed');

  if (completedError) throw completedError;

  const completed = (completedRows ?? []) as CompletedProgramEvidence[];
  const programIds = [...new Set(completed.map((item) => item.program_id))];
  if (programIds.length === 0) return new Map();

  const { data: programs, error: programsError } = await supabase
    .from('programs')
    .select('id, code')
    .in('id', programIds);

  if (programsError) throw programsError;

  const programRows = (programs ?? []) as Array<Pick<TableRow<'programs'>, 'id' | 'code'>>;
  const codeByProgramId = new Map<string, string>(programRows.map((item) => [item.id, item.code]));
  const evidenceByCode = new Map<string, UserAchievement>();

  for (const enrollment of completed) {
    const programCode = codeByProgramId.get(enrollment.program_id);
    if (!programCode) continue;
    const achievementCode = getProgramCompletionAchievementCode(programCode, enrollment.program_level);
    if (!achievementCode || evidenceByCode.has(achievementCode)) continue;

    const awardedAt = enrollment.completed_at || enrollment.updated_at || enrollment.created_at;
    evidenceByCode.set(achievementCode, {
      id: `derived:${enrollment.id}`,
      user_id: userId,
      achievement_code: achievementCode,
      source_type: 'program_enrollment_derived',
      source_id: enrollment.id,
      awarded_at: awardedAt,
      awarded_by: null,
      created_at: awardedAt,
    });
  }

  return evidenceByCode;
}

async function persistAchievementCache(userId: string, items: AchievementWithState[]) {
  cachedAchievementsUserId = userId;
  cachedAchievements = items;

  const payload: AchievementCachePayload = {
    version: 1,
    user_id: userId,
    saved_at: new Date().toISOString(),
    items,
  };

  try {
    await AsyncStorage.setItem(achievementCacheKey(userId), JSON.stringify(payload));
  } catch {
    // La cache local es una mejora offline; nunca debe romper la consulta remota.
  }
}

export async function getCachedAchievementsForUser(userId: string): Promise<AchievementWithState[] | null> {
  if (cachedAchievementsUserId === userId && cachedAchievements) return cachedAchievements;

  try {
    const raw = await AsyncStorage.getItem(achievementCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AchievementCachePayload>;
    if (parsed.version !== 1 || parsed.user_id !== userId || !isCachedAchievementArray(parsed.items)) {
      await AsyncStorage.removeItem(achievementCacheKey(userId));
      return null;
    }

    cachedAchievementsUserId = userId;
    cachedAchievements = parsed.items;
    return parsed.items;
  } catch {
    return null;
  }
}

export async function getAchievementsForUser(userId: string): Promise<AchievementWithState[]> {
  const [definitions, achievementResult, completionEvidence] = await Promise.all([
    getAchievementDefinitions(),
    supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false }),
    getCompletedProgramAchievementEvidence(userId),
  ]);

  if (achievementResult.error) throw achievementResult.error;

  const achievements = (achievementResult.data ?? []).map(normalizeAchievement) as UserAchievement[];
  const achievementByCode = new Map(achievements.map((item) => [item.achievement_code, item]));

  return definitions.map((definition) => {
    const storedAchievement = achievementByCode.get(definition.code) ?? null;
    const derivedAchievement = completionEvidence.get(definition.code) ?? null;
    const achievement = storedAchievement ?? derivedAchievement;
    return {
      definition,
      achievement,
      unlocked: Boolean(achievement),
      unlockSource: storedAchievement ? 'stored' : derivedAchievement ? 'program_completion' : null,
    };
  });
}

export async function refreshAchievementsForUser(userId: string): Promise<AchievementWithState[]> {
  const rows = await withAchievementTimeout(getAchievementsForUser(userId));
  await persistAchievementCache(userId, rows);
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

export function clearAchievementCache() {
  const userId = cachedAchievementsUserId;
  cachedAchievementsUserId = null;
  cachedAchievements = null;
  if (userId) void AsyncStorage.removeItem(achievementCacheKey(userId));
}

export async function clearAchievementCacheForUser(userId: string) {
  if (cachedAchievementsUserId === userId) {
    cachedAchievementsUserId = null;
    cachedAchievements = null;
  }
  try {
    await AsyncStorage.removeItem(achievementCacheKey(userId));
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
    .eq('achievement_code', achievementCode);

  if (error) throw error;
  await clearAchievementCacheForUser(userId);
}

export function formatAchievementDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
