import type { ProgramLevel } from '../types/app.types';

export const PROGRAM_COMPLETION_ACHIEVEMENT_CODES = [
  'puppy_completed',
  'comandos_basico_completed',
  'comandos_medio_completed',
  'comandos_avanzado_completed',
] as const;

export type ProgramCompletionAchievementCode = typeof PROGRAM_COMPLETION_ACHIEVEMENT_CODES[number];

export function isProgramCompletionAchievementCode(value: string | null | undefined): value is ProgramCompletionAchievementCode {
  return PROGRAM_COMPLETION_ACHIEVEMENT_CODES.includes(value as ProgramCompletionAchievementCode);
}

export function getProgramCompletionAchievementCode(
  programCode: string | null | undefined,
  programLevel: ProgramLevel | string | null | undefined,
): ProgramCompletionAchievementCode | null {
  if (programCode === 'puppy') return 'puppy_completed';
  if (programCode !== 'comandos') return null;

  // `base` survives in legacy rows as the first Comandos level.
  if (programLevel === 'base' || programLevel === 'principiante') return 'comandos_basico_completed';
  if (programLevel === 'medio') return 'comandos_medio_completed';
  if (programLevel === 'avanzado') return 'comandos_avanzado_completed';
  return null;
}

export function getProgramCompletionDisplayLabel(code: ProgramCompletionAchievementCode) {
  const labels: Record<ProgramCompletionAchievementCode, string> = {
    puppy_completed: 'Puppy',
    comandos_basico_completed: 'Comandos Básico',
    comandos_medio_completed: 'Comandos Medio',
    comandos_avanzado_completed: 'Comandos Avanzado',
  };
  return labels[code];
}
