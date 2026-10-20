import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_MEMBER_THEME, isMemberThemeKey, type MemberThemeKey } from '../constants/ucapsaFormats';

// Preferencia no sensible, local, aislada por la identidad real de Supabase Auth.
const preferenceKey = (userId: string) => `@ucapsa/member-appearance/${userId}`;

export async function readMemberAppearance(userId: string): Promise<MemberThemeKey> {
  const saved = await AsyncStorage.getItem(preferenceKey(userId));
  return isMemberThemeKey(saved) ? saved : DEFAULT_MEMBER_THEME;
}

export async function saveMemberAppearance(userId: string, theme: MemberThemeKey): Promise<void> {
  if (!userId || !isMemberThemeKey(theme)) throw new Error('Paleta no disponible.');
  await AsyncStorage.setItem(preferenceKey(userId), theme);
}
