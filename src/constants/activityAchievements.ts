import type { ComponentProps } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type ActivityAchievementMetric = 'attendance' | 'practice' | 'visits' | 'streak';

export type ActivityAchievementDefinition = {
  code: string;
  metric: ActivityAchievementMetric;
  threshold: number;
  title: string;
  description: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
};

export const activityAchievementDefinitions: ActivityAchievementDefinition[] = [
  { code: 'attendance_1', metric: 'attendance', threshold: 1, title: 'Primera clase', description: 'Registra tu primera asistencia a clase.', icon: 'school' },
  { code: 'attendance_5', metric: 'attendance', threshold: 5, title: 'En ritmo', description: 'Llega a 5 clases asistidas.', icon: 'school' },
  { code: 'attendance_10', metric: 'attendance', threshold: 10, title: 'Constancia en pista', description: 'Llega a 10 clases asistidas.', icon: 'emoji-events' },
  { code: 'attendance_25', metric: 'attendance', threshold: 25, title: 'Compromiso UCAPSA', description: 'Llega a 25 clases asistidas.', icon: 'military-tech' },
  { code: 'attendance_50', metric: 'attendance', threshold: 50, title: 'Veterano de clase', description: 'Llega a 50 clases asistidas.', icon: 'workspace-premium' },

  { code: 'practice_1', metric: 'practice', threshold: 1, title: 'Primera práctica', description: 'Registra tu primera práctica en casa.', icon: 'pets' },
  { code: 'practice_5', metric: 'practice', threshold: 5, title: 'Hábito en marcha', description: 'Completa 5 prácticas.', icon: 'pets' },
  { code: 'practice_10', metric: 'practice', threshold: 10, title: 'Entrenamiento constante', description: 'Completa 10 prácticas.', icon: 'fitness-center' },
  { code: 'practice_25', metric: 'practice', threshold: 25, title: 'Disciplina', description: 'Completa 25 prácticas.', icon: 'bolt' },
  { code: 'practice_50', metric: 'practice', threshold: 50, title: 'Equipo comprometido', description: 'Completa 50 prácticas.', icon: 'stars' },

  { code: 'visits_1', metric: 'visits', threshold: 1, title: 'Primera visita', description: 'Registra tu primera visita como socio.', icon: 'badge' },
  { code: 'visits_5', metric: 'visits', threshold: 5, title: 'Socio frecuente', description: 'Registra 5 visitas como socio.', icon: 'badge' },
  { code: 'visits_10', metric: 'visits', threshold: 10, title: 'Parte de la casa', description: 'Registra 10 visitas como socio.', icon: 'home' },
  { code: 'visits_25', metric: 'visits', threshold: 25, title: 'Socio activo', description: 'Registra 25 visitas como socio.', icon: 'groups' },
  { code: 'visits_50', metric: 'visits', threshold: 50, title: 'Comunidad UCAPSA', description: 'Registra 50 visitas como socio.', icon: 'groups' },

  { code: 'streak_3', metric: 'streak', threshold: 3, title: 'Tres al hilo', description: 'Mantén una racha de 3 días.', icon: 'local-fire-department' },
  { code: 'streak_7', metric: 'streak', threshold: 7, title: 'Una semana', description: 'Mantén una racha de 7 días.', icon: 'local-fire-department' },
  { code: 'streak_14', metric: 'streak', threshold: 14, title: 'Dos semanas', description: 'Mantén una racha de 14 días.', icon: 'local-fire-department' },
  { code: 'streak_30', metric: 'streak', threshold: 30, title: 'Mes de constancia', description: 'Mantén una racha de 30 días.', icon: 'workspace-premium' },
];

export function activityAchievementValue(metric: ActivityAchievementMetric, facts: {
  attendanceTotal: number;
  memberVisitsTotal: number;
  practiceTotal: number;
  longestPracticeStreak: number;
}) {
  if (metric === 'attendance') return facts.attendanceTotal;
  if (metric === 'visits') return facts.memberVisitsTotal;
  if (metric === 'practice') return facts.practiceTotal;
  return facts.longestPracticeStreak;
}
