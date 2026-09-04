import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { supabase } from '../lib/supabase';
import { clearAchievementCacheForUser } from '../services/achievements.service';
import { clearHomeCache } from '../services/home-cache.service';
import { clearClientReadCache } from '../services/client-read-cache.service';
import { clearPracticeActivityCache } from '../services/practice.service';
import { disableStoredExpoPushToken } from '../services/notifications.service';
import type { AppRole, UserProfile } from '../types/app.types';

const SESSION_BOOT_TIMEOUT_MS = 4_000;
const FIRST_PROFILE_TIMEOUT_MS = 3_500;
const PROFILE_REFRESH_TIMEOUT_MS = 6_000;
const PROFILE_CACHE_PREFIX = 'ucapsa:profile-cache:v1:';
const STARTUP_ERROR_MESSAGE =
  'No pudimos recuperar tu sesion. Si estas sin internet y tu sesion necesita renovarse, conecta una vez y toca Reintentar.';

type CachedProfileRecord = {
  version: 1;
  cachedAt: string;
  profile: UserProfile;
};

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  startupError: string | null;
  usingCachedProfile: boolean;
  lastProfileSyncAt: string | null;
  isOfflineFallback: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  acceptProfile: (nextProfile: UserProfile) => Promise<void>;
  retryStartup: () => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

type SessionProviderProps = {
  children: ReactNode;
};

function profileCacheKey(userId: string) {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

function createTimeoutError(phase: string) {
  return new Error(`UCAPSA timeout during ${phase}.`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, phase: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(createTimeoutError(phase)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as UserProfile | null;
}

async function readCachedProfile(userId: string): Promise<CachedProfileRecord | null> {
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
    console.warn('Could not read cached UCAPSA profile:', error);
    return null;
  }
}

async function writeCachedProfile(profile: UserProfile): Promise<string> {
  const cachedAt = new Date().toISOString();
  const record: CachedProfileRecord = {
    version: 1,
    cachedAt,
    profile,
  };

  try {
    await AsyncStorage.setItem(profileCacheKey(profile.user_id), JSON.stringify(record));
  } catch (error) {
    console.warn('Could not cache UCAPSA profile:', error);
  }

  return cachedAt;
}

async function removeCachedProfile(userId: string) {
  try {
    await AsyncStorage.removeItem(profileCacheKey(userId));
  } catch (error) {
    console.warn('Could not remove cached UCAPSA profile:', error);
  }
}

function shouldReloadProfile(event: string) {
  return event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'MFA_CHALLENGE_VERIFIED';
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [usingCachedProfile, setUsingCachedProfile] = useState(false);
  const [lastProfileSyncAt, setLastProfileSyncAt] = useState<string | null>(null);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const startupRunRef = useRef(0);
  const authEventAttemptRef = useRef(0);

  const user = session?.user ?? null;
  const role = profile?.role ?? null;
  const isAdmin = role === 'admin' || role === 'super_admin';

  async function applyFreshProfile(userId: string, nextProfile: UserProfile | null) {
    if (nextProfile) {
      const syncedAt = await writeCachedProfile(nextProfile);
      setProfile(nextProfile);
      setLastProfileSyncAt(syncedAt);
    } else {
      await removeCachedProfile(userId);
      setProfile(null);
      setLastProfileSyncAt(null);
    }

    setUsingCachedProfile(false);
    setIsOfflineFallback(false);
  }


  async function acceptProfile(nextProfile: UserProfile) {
    if (!user || nextProfile.user_id !== user.id) {
      throw new Error('El perfil guardado no corresponde a la sesion activa.');
    }

    await applyFreshProfile(user.id, nextProfile);
  }

  async function refreshProfile() {
    if (!user) {
      setProfile(null);
      setUsingCachedProfile(false);
      setLastProfileSyncAt(null);
      setIsOfflineFallback(false);
      return;
    }

    try {
      const nextProfile = await withTimeout(
        fetchProfile(user.id),
        PROFILE_REFRESH_TIMEOUT_MS,
        'profile refresh',
      );
      await applyFreshProfile(user.id, nextProfile);
    } catch (error) {
      setIsOfflineFallback(true);
      console.warn('Could not refresh profile; keeping local data:', error);
      throw error;
    }
  }

  function retryStartup() {
    authEventAttemptRef.current += 1;
    setStartupError(null);
    setLoading(true);
    setStartupAttempt((value) => value + 1);
  }

  async function signOut() {
    try {
      await disableStoredExpoPushToken();
    } catch (error) {
      console.warn(
        'Could not disable push token before sign out:',
        error instanceof Error ? error.message : error,
      );
    }

    const currentUserId = session?.user.id ?? null;
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;

    if (currentUserId) {
      await Promise.all([
        removeCachedProfile(currentUserId),
        clearHomeCache(currentUserId),
        clearAchievementCacheForUser(currentUserId),
        clearClientReadCache(currentUserId),
        clearPracticeActivityCache(currentUserId),
      ]);
    }

    setSession(null);
    setProfile(null);
    setStartupError(null);
    setUsingCachedProfile(false);
    setLastProfileSyncAt(null);
    setIsOfflineFallback(false);
  }

  useEffect(() => {
    let isMounted = true;
    const runId = startupRunRef.current + 1;
    startupRunRef.current = runId;

    async function loadInitialSession() {
      setLoading(true);
      setStartupError(null);
      setIsOfflineFallback(false);

      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_BOOT_TIMEOUT_MS,
          'local session',
        );

        if (error) throw error;
        if (!isMounted || startupRunRef.current !== runId) return;

        const nextSession = data.session ?? null;
        setSession(nextSession);

        if (!nextSession?.user) {
          setProfile(null);
          setUsingCachedProfile(false);
          setLastProfileSyncAt(null);
          setLoading(false);
          return;
        }

        const userId = nextSession.user.id;
        const cached = await readCachedProfile(userId);

        if (!isMounted || startupRunRef.current !== runId) return;

        if (cached) {
          setProfile(cached.profile);
          setUsingCachedProfile(true);
          setLastProfileSyncAt(cached.cachedAt);
          setLoading(false);

          void withTimeout(fetchProfile(userId), PROFILE_REFRESH_TIMEOUT_MS, 'background profile refresh')
            .then(async (nextProfile) => {
              if (!isMounted || startupRunRef.current !== runId) return;
              await applyFreshProfile(userId, nextProfile);
            })
            .catch((error) => {
              if (!isMounted || startupRunRef.current !== runId) return;
              setIsOfflineFallback(true);
              console.warn('UCAPSA started with cached profile:', error);
            });

          return;
        }

        try {
          const nextProfile = await withTimeout(
            fetchProfile(userId),
            FIRST_PROFILE_TIMEOUT_MS,
            'first profile load',
          );

          if (!isMounted || startupRunRef.current !== runId) return;
          await applyFreshProfile(userId, nextProfile);
        } catch (error) {
          if (!isMounted || startupRunRef.current !== runId) return;

          // There is already a persisted auth session. Do not block the whole app just
          // because the profile endpoint is unreachable; keep the authenticated shell.
          setProfile(null);
          setUsingCachedProfile(false);
          setLastProfileSyncAt(null);
          setIsOfflineFallback(true);
          console.warn('UCAPSA opened without a remote profile; offline fallback active:', error);
        } finally {
          if (isMounted && startupRunRef.current === runId) setLoading(false);
        }
      } catch (error) {
        if (!isMounted || startupRunRef.current !== runId) return;

        // Supabase getSession reads local storage and only needs the network when the
        // stored session requires a refresh. Do not pretend we can safely recover an
        // authenticated identity here when no valid session snapshot was returned.
        console.warn('UCAPSA could not recover the local session:', error);
        setIsOfflineFallback(true);
        setStartupError(STARTUP_ERROR_MESSAGE);
        setLoading(false);
      }
    }

    void loadInitialSession();

    return () => {
      isMounted = false;
    };
  }, [startupAttempt]);

  useEffect(() => {
    let isMounted = true;

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted || event === 'INITIAL_SESSION') return;

      if (!nextSession?.user) {
        authEventAttemptRef.current += 1;
        setSession(null);
        setProfile(null);
        setStartupError(null);
        setUsingCachedProfile(false);
        setLastProfileSyncAt(null);
        setIsOfflineFallback(false);
        setLoading(false);
        return;
      }

      setSession(nextSession);
      setStartupError(null);

      if (!shouldReloadProfile(event)) return;

      const eventAttempt = authEventAttemptRef.current + 1;
      authEventAttemptRef.current = eventAttempt;
      const userId = nextSession.user.id;

      void (async () => {
        const cached = await readCachedProfile(userId);
        if (!isMounted || authEventAttemptRef.current !== eventAttempt) return;

        if (cached) {
          setProfile(cached.profile);
          setUsingCachedProfile(true);
          setLastProfileSyncAt(cached.cachedAt);
        }

        try {
          const nextProfile = await withTimeout(
            fetchProfile(userId),
            PROFILE_REFRESH_TIMEOUT_MS,
            `auth:${event}`,
          );
          if (!isMounted || authEventAttemptRef.current !== eventAttempt) return;
          await applyFreshProfile(userId, nextProfile);
        } catch (error) {
          if (!isMounted || authEventAttemptRef.current !== eventAttempt) return;
          setIsOfflineFallback(true);
          console.warn(`Could not refresh profile after ${event}; keeping local data:`, error);
        }
      })();
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user,
      profile,
      role,
      loading,
      startupError,
      usingCachedProfile,
      lastProfileSyncAt,
      isOfflineFallback,
      isAdmin,
      refreshProfile,
      acceptProfile,
      retryStartup,
      signOut,
    }),
    [
      session,
      user,
      profile,
      role,
      loading,
      startupError,
      usingCachedProfile,
      lastProfileSyncAt,
      isOfflineFallback,
      isAdmin,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used inside SessionProvider.');
  }

  return context;
}
