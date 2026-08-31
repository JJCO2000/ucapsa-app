import { ucapsaBrand } from './brand';

/**
 * Alias legado. La fuente de verdad es constants/brand.ts.
 * Se conserva para no romper componentes antiguos durante la migracion.
 */
export const colors = {
  background: ucapsaBrand.colors.background,
  surface: ucapsaBrand.colors.surface,
  surfaceMuted: ucapsaBrand.colors.graySoft,
  primary: ucapsaBrand.colors.red,
  primaryDark: ucapsaBrand.colors.redDark,
  accent: ucapsaBrand.colors.gold,
  text: ucapsaBrand.colors.text,
  textMuted: ucapsaBrand.colors.muted,
  textLight: ucapsaBrand.colors.textLight,
  border: ucapsaBrand.colors.border,
  darkBackground: ucapsaBrand.colors.premiumBackground,
  success: ucapsaBrand.colors.success,
  warning: ucapsaBrand.colors.warning,
  danger: ucapsaBrand.colors.danger,
} as const;

export type AppColorName = keyof typeof colors;
