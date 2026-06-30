import { supabase } from '../lib/supabase';

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
};

let cachedAchievementsUserId: string | null = null;
let cachedAchievements: AchievementWithState[] | null = null;

function normalizeDefinition(row: unknown): AchievementDefinition {
  return row as AchievementDefinition;
}

function normalizeAchievement(row: unknown): UserAchievement {
  return row as UserAchievement;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
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
  const achievementByCode = new Map(achievements.map((item) => [item.achievement_code, item]));

  return definitions.map((definition) => {
    const achievement = achievementByCode.get(definition.code) ?? null;
    return {
      definition,
      achievement,
      unlocked: Boolean(achievement),
    };
  });
}

export async function getMyAchievements(): Promise<AchievementWithState[]> {
  const userId = await getCurrentUserId();
  if (cachedAchievementsUserId === userId && cachedAchievements) return cachedAchievements;

  const rows = await getAchievementsForUser(userId);
  cachedAchievementsUserId = userId;
  cachedAchievements = rows;
  return rows;
}

export function clearAchievementCache() {
  cachedAchievementsUserId = null;
  cachedAchievements = null;
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
  clearAchievementCache();
}

export async function revokeAchievementFromUser(userId: string, achievementCode: string): Promise<void> {
  const { error } = await supabase
    .from('user_achievements')
    .delete()
    .eq('user_id', userId)
    .eq('achievement_code', achievementCode);

  if (error) throw error;
  clearAchievementCache();
}

export function formatAchievementDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
