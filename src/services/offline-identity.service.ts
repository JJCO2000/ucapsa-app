import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';

// This is a read-only identity hint, NOT an access token and NOT proof of a valid JWT.
// Never use it to authorize a Supabase write, admin action or remote RPC.
const KEY = 'ucapsa:offline-last-verified-user:v1';

type LocalIdentity = {
  version: 1;
  user_id: string;
  email: string | null;
  verified_at: string;
};

export async function rememberVerifiedLocalUser(user: User): Promise<void> {
  const record: LocalIdentity = {
    version: 1,
    user_id: user.id,
    email: user.email ?? null,
    verified_at: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(record));
}

export async function readVerifiedLocalUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<LocalIdentity>;
    if (record.version !== 1 || typeof record.user_id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(record.user_id)
      || typeof record.verified_at !== 'string') return null;
    // Minimal shape for local-only views. No reusable auth tokens are stored here.
    return {
      id: record.user_id,
      email: typeof record.email === 'string' ? record.email : undefined,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: record.verified_at,
    };
  } catch {
    return null;
  }
}

export async function clearVerifiedLocalUser(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/**
 * Only allow local identity fallback if the backend cannot be reached.
 * A bad password, revoked session or explicit logout must not be mistaken for offline.
 * HTTP errors still prove connectivity; a timeout / transport failure does not.
 */
export async function isBackendUnreachable(): Promise<boolean> {
  const host = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!host) return false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const response = fetch(host, { method: 'HEAD' });
    const result = await Promise.race([
      response.then(() => 'reached' as const, () => 'unreachable' as const),
      new Promise<'unreachable'>((resolve) => {
        timeout = setTimeout(() => resolve('unreachable'), 2200);
      }),
    ]);
    return result === 'unreachable';
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
