import AsyncStorage from '@react-native-async-storage/async-storage';

import { devWarn } from '../lib/client-diagnostics';
import type { UserProfile } from '../types/app.types';

const PROFILE_CACHE_PREFIX = 'ucapsa:profile-cache:v1:';

export type CachedProfileRecord = {
  version: 1;
  cachedAt: string;
  profile: UserProfile;
};

function profileCacheKey(userId: string) {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

export async function readCachedProfile(userId: string): Promise<CachedProfileRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(profileCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedProfileRecord> | null;
    const cachedProfile = parsed?.profile as UserProfile | undefined;

    if (
      parsed?.version !== 1 ||
      typeof parsed.cachedAt !== 'string' ||
      !cachedProfile ||
      cachedProfile.user_id !== userId
    ) {
      await AsyncStorage.removeItem(profileCacheKey(userId));
      return null;
    }

    return {
      version: 1,
      cachedAt: parsed.cachedAt,
      profile: cachedProfile,
    };
  } catch (error) {
    devWarn('Could not read cached UCAPSA profile.', error);
    return null;
  }
}

export async function writeCachedProfile(profile: UserProfile): Promise<string> {
  const cachedAt = new Date().toISOString();
  const record: CachedProfileRecord = {
    version: 1,
    cachedAt,
    profile,
  };

  try {
    await AsyncStorage.setItem(profileCacheKey(profile.user_id), JSON.stringify(record));
  } catch (error) {
    devWarn('Could not cache UCAPSA profile.', error);
  }

  return cachedAt;
}

export async function removeCachedProfile(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(profileCacheKey(userId));
  } catch (error) {
    devWarn('Could not remove cached UCAPSA profile.', error);
  }
}
