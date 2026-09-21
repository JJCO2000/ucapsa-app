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

export function mergeDefinitionsWithStoredAchievements(
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

export function countUnlockedAchievements(items: AchievementWithState[]) {
  return items.filter((item) => item.unlocked).length;
}

export function formatAchievementDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
