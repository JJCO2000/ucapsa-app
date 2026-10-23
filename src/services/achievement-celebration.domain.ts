import type { AchievementWithState } from './achievements.domain';

/**
 * Celebra solo un premio NUEVO confirmado por la base, nunca una definición
 * añadida o datos iniciales sin referencia. El caché anterior ya se guarda
 * por cuenta y perro; no introducimos otra fuente de premios.
 */
export function getNewlyAwardedAchievement(
  previous: AchievementWithState[] | null,
  current: AchievementWithState[],
): AchievementWithState | null {
  if (!previous) return null; // Primer inicio, sesión nueva o caché inexistente.
  const seenAwardIds = new Set(
    previous.filter((item) => item.unlocked && item.achievement?.id)
      .map((item) => item.achievement!.id),
  );
  const firstNew = current
    .filter((item) => item.unlocked && item.achievement?.id
      && !seenAwardIds.has(item.achievement.id))
    .sort((a, b) => {
      const aTime = Date.parse(a.achievement?.awarded_at ?? '') || 0;
      const bTime = Date.parse(b.achievement?.awarded_at ?? '') || 0;
      return bTime - aTime;
    });
  return firstNew[0] ?? null;
}
