import { ucapsaBrand, withAlpha } from './brand';
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

const brandLight = {
  accent: ucapsaBrand.colors.red,
  accentDark: ucapsaBrand.colors.redDark,
  accentSoft: ucapsaBrand.colors.redSoft,
  background: ucapsaBrand.colors.background,
  surface: ucapsaBrand.colors.surface,
  surfaceAlt: ucapsaBrand.colors.surfaceAlt,
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
} as const;

export const ucapsaFormats: Record<UcapsaFormatKey, UcapsaFormat> = {
  visitor: {
    key: 'visitor', label: 'Visitante', shortLabel: 'Publico', title: 'Bienvenido a UCAPSA',
    subtitle: 'Consulta anuncios y calendario oficial antes de iniciar sesion.', icon: 'paw', ...brandLight,
  },
  client: {
    key: 'client', label: 'Cliente UCAPSA', shortLabel: 'Cliente', title: 'Tu espacio UCAPSA',
    subtitle: 'Clases, progreso, practica, pagos y tus perros en un solo lugar.', icon: 'account-circle', ...brandLight,
  },
  member: {
    key: 'member', label: 'Socio UCAPSA', shortLabel: 'Socio', title: 'Tu UCAPSA',
    subtitle: 'Membresia, visitas, clases, practica y pagos en un solo lugar.', icon: 'crown',
    accent: ucapsaBrand.colors.gold,
    accentDark: ucapsaBrand.colors.premiumActionText,
    accentSoft: ucapsaBrand.colors.goldSoft,
    background: ucapsaBrand.colors.premiumBackground,
    surface: ucapsaBrand.colors.premiumSurface,
    surfaceAlt: ucapsaBrand.colors.premiumSurfaceAlt,
    border: ucapsaBrand.colors.premiumBorder,
    text: ucapsaBrand.colors.premiumText,
    muted: ucapsaBrand.colors.premiumMuted,
    heroBackground: ucapsaBrand.colors.premiumHero,
    heroText: ucapsaBrand.colors.premiumText,
    heroMuted: ucapsaBrand.colors.premiumMuted,
    primaryButton: ucapsaBrand.colors.gold,
    primaryButtonText: ucapsaBrand.colors.redDeeper,
    secondaryButton: withAlpha(ucapsaBrand.colors.surface, 0.10),
    secondaryButtonText: ucapsaBrand.colors.goldSoft,
    cardBackground: ucapsaBrand.colors.premiumHero,
    cardBorder: ucapsaBrand.colors.gold,
    cardText: ucapsaBrand.colors.premiumText,
    pillBackground: ucapsaBrand.colors.goldSoft,
    pillText: ucapsaBrand.colors.premiumActionText,
  },
  admin: {
    key: 'admin', label: 'Administracion', shortLabel: 'Admin', title: 'Panel operativo',
    subtitle: 'Gestion de clientes, socios, clases, visitas, pagos y comunicacion.', icon: 'account-cog',
    ...brandLight,
    background: ucapsaBrand.colors.graySoft,
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

export function getActiveModuleLabels(input: { isMember?: boolean; hasPuppy?: boolean; hasComandos?: boolean }) {
  return [input.isMember ? 'Socio' : null, input.hasPuppy ? 'Puppy' : null, input.hasComandos ? 'Comandos' : null].filter(Boolean) as string[];
}

export function getFormatTitle(format: UcapsaFormat, displayName?: string | null) {
  if (format.key === 'visitor') return 'Bienvenido a UCAPSA';
  if (format.key === 'admin') return 'Panel administrativo';
  if (format.key === 'member') return displayName || 'Socio UCAPSA';
  return `Hola, ${displayName || 'Cliente UCAPSA'}`;
}
