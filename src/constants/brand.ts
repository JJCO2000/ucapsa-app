/**
 * Fuente unica de color de UCAPSA.
 *
 * Regla del proyecto: ningun componente o pantalla debe repetir codigos de color.
 * Si un color cambia, se cambia aqui y se refleja en toda la app.
 */
export const ucapsaBrand = {
  name: 'UCAPSA',
  slogan: 'La universidad de tu perro',
  colors: {
    // Marca
    red: '#C91F37',
    redDark: '#8F1324',
    redDeep: '#6D0817',
    redDeeper: '#4A0710',
    redSoft: '#FFE8EC',
    redSoftStrong: '#FFDCE2',
    redSoftMuted: '#FFF1F3',
    redPale: '#FFF8F8',
    redBorder: '#F3B8C2',

    gold: '#FACC15',
    goldDark: '#92400E',
    goldSoft: '#FFE8B5',
    goldPale: '#FFF7CC',

    // Colores de contenido. Se conservan como tokens; nunca se escriben directo en UI.
    blue: '#2563EB',
    blueDark: '#1D4ED8',
    blueSoft: '#EAF1FF',
    green: '#0F766E',
    greenDark: '#134E4A',
    greenSoft: '#CCFBF1',
    purple: '#7C3AED',
    purpleDark: '#5B21B6',
    purpleSoft: '#EDE9FE',
    gray: '#64748B',
    grayDark: '#334155',
    graySoft: '#F1F5F9',

    // Superficies y texto
    background: '#FFF8F8',
    surface: '#FFFFFF',
    surfaceAlt: '#FFF1F3',
    surfaceSubtle: '#FFFDFD',
    border: '#F0D4DA',
    borderNeutral: '#E2E8F0',
    text: '#25151A',
    muted: '#70545E',
    mutedNeutral: '#64748B',
    textLight: '#CBD5E1',
    black: '#000000',
    cameraDark: '#111827',

    // Estados con contraste AA sobre su superficie asociada.
    success: '#157347',
    successDark: '#166534',
    successSoft: '#F0FDF4',
    successBorder: '#BBF7D0',
    warning: '#A35A00',
    warningDark: '#92400E',
    warningSoft: '#FFF7ED',
    warningBorder: '#FED7AA',
    danger: '#991B1B',
    dangerSoft: '#FEF2F2',
    dangerBorder: '#FECACA',

    // Experiencia Club UCAPSA: marfil y blanco como base, borgoña como marca
    // y dorado reservado para estatus, hitos y detalles realmente exclusivos.
    premiumBackground: '#F7EFE2',
    premiumSurface: '#FFFEFB',
    premiumSurfaceAlt: '#F3E5CF',
    premiumBorder: '#DCC9A6',
    premiumBorderStrong: '#C5A66B',
    premiumHero: '#FFF8EC',
    premiumText: '#2F191D',
    premiumMuted: '#71595E',
    premiumAction: '#A87821',
    premiumActionSoft: '#E6C982',
    premiumActionText: '#6D0817',
    premiumBurgundySoft: '#F1E1E3',
  },
  socialLinks: [
    { key: 'whatsapp', label: 'WhatsApp', url: 'https://wa.me/525522410679', icon: 'whatsapp' },
    { key: 'website', label: 'Sitio web', url: 'https://www.ucapsa.mx', icon: 'web' },
    { key: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/UCAPSA/', icon: 'facebook' },
    { key: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/byucapsa/', icon: 'instagram' },
    { key: 'x', label: 'X', url: 'https://x.com/ucapsa', icon: 'twitter' },
  ] as const,
} as const;

/** Convierte un token HEX de la fuente de verdad a rgba sin duplicar RGB. */
export function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized.slice(0, 6);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${red},${green},${blue},${safeAlpha})`;
}

export const ucapsaColorKeyPalette = {
  red: { accent: ucapsaBrand.colors.red, soft: ucapsaBrand.colors.redSoft, text: ucapsaBrand.colors.redDark },
  blue: { accent: ucapsaBrand.colors.blue, soft: ucapsaBrand.colors.blueSoft, text: ucapsaBrand.colors.blueDark },
  yellow: { accent: ucapsaBrand.colors.gold, soft: ucapsaBrand.colors.goldPale, text: ucapsaBrand.colors.goldDark },
  green: { accent: ucapsaBrand.colors.green, soft: ucapsaBrand.colors.greenSoft, text: ucapsaBrand.colors.greenDark },
  purple: { accent: ucapsaBrand.colors.purple, soft: ucapsaBrand.colors.purpleSoft, text: ucapsaBrand.colors.purpleDark },
  gray: { accent: ucapsaBrand.colors.gray, soft: ucapsaBrand.colors.graySoft, text: ucapsaBrand.colors.grayDark },
} as const;
