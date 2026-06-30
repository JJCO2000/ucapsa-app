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
    accent: '#C91F37',
    accentDark: '#8F1324',
    accentSoft: '#FFE8EC',
    background: '#FFF8F8',
    surface: '#FFFFFF',
    surfaceAlt: '#FFF1F3',
    border: '#F0D4DA',
    text: '#25151A',
    muted: '#70545E',
    heroBackground: '#FFFFFF',
    heroText: '#25151A',
    heroMuted: '#70545E',
    primaryButton: '#C91F37',
    primaryButtonText: '#FFFFFF',
    secondaryButton: '#FFE8EC',
    secondaryButtonText: '#8F1324',
    cardBackground: '#FFFFFF',
    cardBorder: '#F0D4DA',
    cardText: '#25151A',
    pillBackground: '#FFE8EC',
    pillText: '#8F1324',
  },
  client: {
    key: 'client',
    label: 'Cliente UCAPSA',
    shortLabel: 'Cliente',
    title: 'Tu espacio UCAPSA',
    subtitle: 'Completa tu perfil, revisa avisos y solicita membresia cuando este listo.',
    icon: 'account-circle',
    accent: '#C91F37',
    accentDark: '#8F1324',
    accentSoft: '#FFE8EC',
    background: '#FFF8F8',
    surface: '#FFFFFF',
    surfaceAlt: '#FFF1F3',
    border: '#F0D4DA',
    text: '#25151A',
    muted: '#70545E',
    heroBackground: '#FFFFFF',
    heroText: '#25151A',
    heroMuted: '#70545E',
    primaryButton: '#C91F37',
    primaryButtonText: '#FFFFFF',
    secondaryButton: '#FFE8EC',
    secondaryButtonText: '#8F1324',
    cardBackground: '#FFFFFF',
    cardBorder: '#F0D4DA',
    cardText: '#25151A',
    pillBackground: '#FFE8EC',
    pillText: '#8F1324',
  },
  member: {
    key: 'member',
    label: 'Socio UCAPSA',
    shortLabel: 'Socio',
    title: 'Experiencia socio',
    subtitle: 'Acceso activo a credencial, QR y beneficios UCAPSA.',
    icon: 'crown',
    accent: '#FACC15',
    accentDark: '#7A1020',
    accentSoft: '#FFE8B5',
    background: '#270711',
    surface: '#38111B',
    surfaceAlt: '#461521',
    border: '#7A2A36',
    text: '#FFFFFF',
    muted: '#FFE3E8',
    heroBackground: '#6D0817',
    heroText: '#FFFFFF',
    heroMuted: '#FFE3E8',
    primaryButton: '#FACC15',
    primaryButtonText: '#4A0710',
    secondaryButton: 'rgba(255,255,255,0.10)',
    secondaryButtonText: '#FFE8B5',
    cardBackground: '#6D0817',
    cardBorder: '#FACC15',
    cardText: '#FFFFFF',
    pillBackground: '#FFE8B5',
    pillText: '#7A1020',
  },
  admin: {
    key: 'admin',
    label: 'Administracion',
    shortLabel: 'Admin',
    title: 'Panel operativo',
    subtitle: 'Gestion rapida de socios, clases, calendario y comunicacion oficial.',
    icon: 'account-cog',
    accent: '#0f766e',
    accentDark: '#134e4a',
    accentSoft: '#ccfbf1',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceAlt: '#ECFDF5',
    border: '#CBD5E1',
    text: '#0f172a',
    muted: '#475569',
    heroBackground: '#0f172a',
    heroText: '#FFFFFF',
    heroMuted: '#CBD5E1',
    primaryButton: '#0f766e',
    primaryButtonText: '#FFFFFF',
    secondaryButton: '#ccfbf1',
    secondaryButtonText: '#134e4a',
    cardBackground: '#FFFFFF',
    cardBorder: '#CBD5E1',
    cardText: '#0f172a',
    pillBackground: '#ccfbf1',
    pillText: '#134e4a',
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
