import { ucapsaBrand } from './brand';
import type { AppRole, MembershipStatus } from '../types/app.types';

export type UcapsaFormatKey = 'visitor' | 'client' | 'member' | 'admin';

export type UcapsaFormat = {
  key: UcapsaFormatKey;
  label: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  heroBackground: string;
  heroText: string;
  heroMuted: string;
  primaryButton: string;
  primaryButtonText: string;
  secondaryButton: string;
  secondaryButtonText: string;
  cardBackground: string;
  cardBorder: string;
  cardText: string;
  pillBackground: string;
  pillText: string;
};

export const ucapsaFormats: Record<UcapsaFormatKey, UcapsaFormat> = {
  visitor: {
    key: 'visitor',
    label: 'Visitante',
    shortLabel: 'Publico',
    title: 'Bienvenido a UCAPSA',
    subtitle: 'Consulta anuncios y calendario oficial antes de iniciar sesion.',
    icon: 'paw',
    accent: ucapsaBrand.colors.red,
    accentDark: ucapsaBrand.colors.redDark,
    accentSoft: ucapsaBrand.colors.redSoft,
    background: ucapsaBrand.colors.redPale,
    surface: ucapsaBrand.colors.surface,
    surfaceAlt: ucapsaBrand.colors.redSoftMuted,
    border: ucapsaBrand.colors.border,
    text: ucapsaBrand.colors.text,
    muted: ucapsaBrand.colors.muted,
    heroBackground: ucapsaBrand.colors.surface,
    heroText: ucapsaBrand.colors.text,
    heroMuted: ucapsaBrand.colors.muted,
    primaryButton: ucapsaBrand.colors.red,
    primaryButtonText: ucapsaBrand.colors.surface,
    secondaryButton: ucapsaBrand.colors.redSoft,
    secondaryButtonText: ucapsaBrand.colors.redDark,
    cardBackground: ucapsaBrand.colors.surface,
    cardBorder: ucapsaBrand.colors.border,
    cardText: ucapsaBrand.colors.text,
    pillBackground: ucapsaBrand.colors.redSoft,
    pillText: ucapsaBrand.colors.redDark,
  },
  client: {
    key: 'client',
    label: 'Cliente UCAPSA',
    shortLabel: 'Cliente',
    title: 'Tu espacio UCAPSA',
    subtitle: 'Completa tu perfil, revisa avisos y solicita membresia cuando este listo.',
    icon: 'account-circle',
    accent: ucapsaBrand.colors.red,
    accentDark: ucapsaBrand.colors.redDark,
    accentSoft: ucapsaBrand.colors.redSoft,
    background: ucapsaBrand.colors.redPale,
    surface: ucapsaBrand.colors.surface,
    surfaceAlt: ucapsaBrand.colors.redSoftMuted,
    border: ucapsaBrand.colors.border,
    text: ucapsaBrand.colors.text,
    muted: ucapsaBrand.colors.muted,
    heroBackground: ucapsaBrand.colors.surface,
    heroText: ucapsaBrand.colors.text,
    heroMuted: ucapsaBrand.colors.muted,
    primaryButton: ucapsaBrand.colors.red,
    primaryButtonText: ucapsaBrand.colors.surface,
    secondaryButton: ucapsaBrand.colors.redSoft,
    secondaryButtonText: ucapsaBrand.colors.redDark,
    cardBackground: ucapsaBrand.colors.surface,
    cardBorder: ucapsaBrand.colors.border,
    cardText: ucapsaBrand.colors.text,
    pillBackground: ucapsaBrand.colors.redSoft,
    pillText: ucapsaBrand.colors.redDark,
  },
  member: {
    key: 'member',
    label: 'Socio UCAPSA',
    shortLabel: 'Socio',
    title: 'Club UCAPSA',
    subtitle: 'Tu acceso, tu recorrido y tu lugar dentro de UCAPSA.',
    icon: 'crown',
    accent: ucapsaBrand.colors.premiumAction,
    accentDark: ucapsaBrand.colors.redDeep,
    accentSoft: ucapsaBrand.colors.premiumSurfaceAlt,
    background: ucapsaBrand.colors.premiumBackground,
    surface: ucapsaBrand.colors.premiumSurface,
    surfaceAlt: ucapsaBrand.colors.premiumSurfaceAlt,
    border: ucapsaBrand.colors.premiumBorder,
    text: ucapsaBrand.colors.premiumText,
    muted: ucapsaBrand.colors.premiumMuted,
    heroBackground: ucapsaBrand.colors.premiumHero,
    heroText: ucapsaBrand.colors.premiumText,
    heroMuted: ucapsaBrand.colors.premiumMuted,
    primaryButton: ucapsaBrand.colors.redDeep,
    primaryButtonText: ucapsaBrand.colors.surface,
    secondaryButton: ucapsaBrand.colors.premiumSurfaceAlt,
    secondaryButtonText: ucapsaBrand.colors.redDeep,
    cardBackground: ucapsaBrand.colors.premiumSurface,
    cardBorder: ucapsaBrand.colors.premiumBorder,
    cardText: ucapsaBrand.colors.premiumText,
    pillBackground: ucapsaBrand.colors.premiumPill,
    pillText: ucapsaBrand.colors.redDeep,
  },
  admin: {
    key: 'admin',
    label: 'Administracion',
    shortLabel: 'Admin',
    title: 'Panel operativo',
    subtitle: 'Gestion rapida de socios, clases, calendario y comunicacion oficial.',
    icon: 'account-cog',
    accent: ucapsaBrand.colors.green,
    accentDark: ucapsaBrand.colors.greenDark,
    accentSoft: ucapsaBrand.colors.greenSoft,
    background: ucapsaBrand.colors.adminBackground,
    surface: ucapsaBrand.colors.surface,
    surfaceAlt: ucapsaBrand.colors.adminSurfaceAlt,
    border: ucapsaBrand.colors.adminBorder,
    text: ucapsaBrand.colors.adminText,
    muted: ucapsaBrand.colors.adminMuted,
    heroBackground: ucapsaBrand.colors.adminText,
    heroText: ucapsaBrand.colors.surface,
    heroMuted: ucapsaBrand.colors.adminBorder,
    primaryButton: ucapsaBrand.colors.green,
    primaryButtonText: ucapsaBrand.colors.surface,
    secondaryButton: ucapsaBrand.colors.greenSoft,
    secondaryButtonText: ucapsaBrand.colors.greenDark,
    cardBackground: ucapsaBrand.colors.surface,
    cardBorder: ucapsaBrand.colors.adminBorder,
    cardText: ucapsaBrand.colors.adminText,
    pillBackground: ucapsaBrand.colors.greenSoft,
    pillText: ucapsaBrand.colors.greenDark,
  },
};

export function resolveUcapsaFormat(input: {
  user?: unknown | null;
  role?: AppRole | null;
  isAdmin?: boolean;
  membershipStatus?: MembershipStatus | null;
  hasActivePrograms?: boolean;
}): UcapsaFormat {
  if (input.isAdmin || input.role === 'admin' || input.role === 'super_admin') return ucapsaFormats.admin;
  if (input.role === 'member' || input.membershipStatus === 'active') return ucapsaFormats.member;
  if (input.user || input.hasActivePrograms || input.membershipStatus === 'pending') return ucapsaFormats.client;
  return ucapsaFormats.visitor;
}

export function getActiveModuleLabels(input: {
  isMember?: boolean;
  hasPuppy?: boolean;
  hasComandos?: boolean;
}) {
  return [
    input.isMember ? 'Socio' : null,
    input.hasPuppy ? 'Puppy' : null,
    input.hasComandos ? 'Comandos' : null,
  ].filter(Boolean) as string[];
}

export function getFormatTitle(format: UcapsaFormat, displayName?: string | null) {
  if (format.key === 'visitor') return 'Bienvenido a UCAPSA';
  if (format.key === 'admin') return 'Panel administrativo';
  if (format.key === 'member') return displayName || 'Socio UCAPSA';
  return `Hola, ${displayName || 'Cliente UCAPSA'}`;
}
