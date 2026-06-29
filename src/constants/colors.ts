export const colors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  primary: '#0f766e',
  primaryDark: '#134e4a',
  accent: '#38bdf8',
  text: '#0f172a',
  textMuted: '#475569',
  textLight: '#cbd5e1',
  border: '#e2e8f0',
  darkBackground: '#0f172a',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
} as const;

export type AppColorName = keyof typeof colors;
