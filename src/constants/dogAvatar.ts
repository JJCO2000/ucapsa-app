import { ucapsaBrand } from './brand';

export const DOG_AVATAR_KEYS = [
  'dog_face',
  'dog_side',
  'poodle',
  'guide_dog',
  'service_dog',
  'paw',
  'cartoon_dog',
  'cartoon_dog_side',
  'cartoon_paw',
  'cartoon_bone',
  'dog_heart',
  'dog_star',
  'dog_sun',
  'dog_moon',
  'dog_play',
] as const;

export type DogAvatarKey = (typeof DOG_AVATAR_KEYS)[number];

export const DOG_AVATAR_COLORS = [
  ucapsaBrand.colors.dogAvatarIvory,
  ucapsaBrand.colors.dogAvatarBurgundy,
  ucapsaBrand.colors.dogAvatarGold,
  ucapsaBrand.colors.dogAvatarBlue,
  ucapsaBrand.colors.dogAvatarTeal,
  ucapsaBrand.colors.dogAvatarPurple,
  ucapsaBrand.colors.dogAvatarOrange,
  ucapsaBrand.colors.dogAvatarRose,
] as const;

export type DogAvatarColor = (typeof DOG_AVATAR_COLORS)[number];

export const DOG_AVATAR_FOREGROUND_COLORS = [
  ucapsaBrand.colors.dogAvatarDark, ucapsaBrand.colors.surface,
  ucapsaBrand.colors.dogAvatarBurgundy, ucapsaBrand.colors.dogAvatarBlue,
  ucapsaBrand.colors.dogAvatarTeal, ucapsaBrand.colors.dogAvatarGold,
] as const;
export type DogAvatarForegroundColor = (typeof DOG_AVATAR_FOREGROUND_COLORS)[number];
export function normalizeDogAvatarForegroundColor(value: unknown): DogAvatarForegroundColor | null {
  return DOG_AVATAR_FOREGROUND_COLORS.includes(value as DogAvatarForegroundColor)
    ? value as DogAvatarForegroundColor : null;
}
function avatarLuminance(color: string): number {
  const channel = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255)
    .map((v) => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
  return channel[0] * .2126 + channel[1] * .7152 + channel[2] * .0722;
}
export function isAccessibleDogAvatarForeground(background: string, foreground: string) {
  const a = avatarLuminance(background), b = avatarLuminance(foreground);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 3;
}
export function availableDogAvatarForegrounds(background: string) {
  return DOG_AVATAR_FOREGROUND_COLORS.filter((color) => isAccessibleDogAvatarForeground(background,color));
}
export const DEFAULT_DOG_AVATAR_KEY: DogAvatarKey = 'dog_face';
export const DEFAULT_DOG_AVATAR_COLOR: DogAvatarColor = ucapsaBrand.colors.dogAvatarIvory;

export const DOG_AVATAR_OPTIONS: Array<{
  key: DogAvatarKey;
  label: string;
  kind: 'emoji' | 'icon';
  value: string;
  badge?: string;
}> = [
  { key: 'dog_face', label: 'Perrito', kind: 'emoji', value: '🐶' },
  { key: 'dog_side', label: 'Perro', kind: 'emoji', value: '🐕' },
  { key: 'poodle', label: 'Poodle', kind: 'emoji', value: '🐩' },
  { key: 'guide_dog', label: 'Guía', kind: 'emoji', value: '🦮' },
  { key: 'service_dog', label: 'Servicio', kind: 'emoji', value: '🐕‍🦺' },
  { key: 'paw', label: 'Huella', kind: 'emoji', value: '🐾' },
  { key: 'cartoon_dog', label: 'Caricatura 1', kind: 'icon', value: 'dog' },
  { key: 'cartoon_dog_side', label: 'Caricatura 2', kind: 'icon', value: 'dog-side' },
  { key: 'cartoon_paw', label: 'Caricatura 3', kind: 'icon', value: 'paw' },
  { key: 'cartoon_bone', label: 'Caricatura 4', kind: 'icon', value: 'bone' },
  { key: 'dog_heart', label: 'Cariñoso', kind: 'icon', value: 'dog', badge: 'heart' },
  { key: 'dog_star', label: 'Estrella', kind: 'icon', value: 'dog', badge: 'star' },
  { key: 'dog_sun', label: 'Alegre', kind: 'icon', value: 'dog-side', badge: 'white-balance-sunny' },
  { key: 'dog_moon', label: 'Dormilón', kind: 'icon', value: 'dog-side', badge: 'moon-waning-crescent' },
  { key: 'dog_play', label: 'Juguetón', kind: 'icon', value: 'dog', badge: 'tennis-ball' },
];

export function normalizeDogAvatarKey(value: unknown): DogAvatarKey {
  return DOG_AVATAR_KEYS.includes(value as DogAvatarKey)
    ? value as DogAvatarKey
    : DEFAULT_DOG_AVATAR_KEY;
}

export function normalizeDogAvatarColor(value: unknown): DogAvatarColor {
  return DOG_AVATAR_COLORS.includes(value as DogAvatarColor)
    ? value as DogAvatarColor
    : DEFAULT_DOG_AVATAR_COLOR;
}

export function dogAvatarForeground(background: string) {
  return background === ucapsaBrand.colors.dogAvatarIvory || background === ucapsaBrand.colors.dogAvatarGold
    ? ucapsaBrand.colors.dogAvatarDark
    : ucapsaBrand.colors.surface;
}
