import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ReactNode } from 'react';

import { getRoleCapabilities, type UcapsaCapabilities } from '../constants/roleCapabilities';
import { devWarn } from '../lib/client-diagnostics';
import { clearAchievementCacheForUser } from '../services/achievements.service';
import { getCurrentSession, signOutLocal, subscribeToAuthState } from '../services/auth.service';
import { clearHomeCache } from '../services/home-cache.service';
import { clearClientReadCache } from '../services/client-read-cache.service';
import { clearPracticeActivityCache } from '../services/practice.service';
import { disableStoredExpoPushToken } from '../services/notifications.service';
import { getProfileByUserId } from '../services/profiles.service';
import { claimMyPreregisteredDogs } from '../services/dog-preregistration.service';
import {
  clearVerifiedLocalUser,
  isBackendUnreachable,
  readVerifiedLocalUser,
  rememberVerifiedLocalUser,
} from '../services/offline-identity.service';
import { readCachedProfile, removeCachedProfile, writeCachedProfile } from '../services/profile-cache.service';
import type { AppRole, UserProfile } from '../types/app.types';
import { withOperationTimeout } from '../utils/async.utils';

const SESSION_BOOT_TIMEOUT_MS = 4_000;
const FIRST_PROFILE_TIMEOUT_MS = 3_500;
const PROFILE_REFRESH_TIMEOUT_MS = 6_000;
const STARTUP_ERROR_MESSAGE =
  'No pudimos recuperar tu sesion. Si estas sin internet y tu sesion necesita renovarse, conecta una vez y toca Reintentar.';

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
  preregistrationSyncVersion: number;
  isAdmin: boolean;
  isTrainer: boolean;
  isStaff: boolean;
  capabilities: UcapsaCapabilities;
  refreshProfile: () => Promise<void>;
  acceptProfile: (nextProfile: UserProfile) => Promise<void>;
  retryStartup: () => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

type SessionProviderProps = {
  children: ReactNode;
};

function shouldReloadProfile(event: string) {
  return event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'MFA_CHALLENGE_VERIFIED';
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [offlineUser, setOfflineUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [usingCachedProfile, setUsingCachedProfile] = useState(false);
  const [lastProfileSyncAt, setLastProfileSyncAt] = useState<string | null>(null);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [preregistrationSyncVersion, setPreregistrationSyncVersion] = useState(0);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const startupRunRef = useRef(0);
  const claimedPreregistrationKeyRef = useRef<string | null>(null);
  const authEventAttemptRef = useRef(0);

  // The local identity only enables cached read-only views; all server requests
  // still rely on Supabase Auth's real session and RLS.
  const user = session?.user ?? (isOfflineFallback ? offlineUser : null);
  const role = profile?.role ?? null;
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isTrainer = role === 'trainer';
  const isStaff = isAdmin || isTrainer;
  const capabilities = useMemo(() => getRoleCapabilities(role), [role]);

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
      const nextProfile = await withOperationTimeout(
        getProfileByUserId(user.id),
        PROFILE_REFRESH_TIMEOUT_MS,
        'profile refresh',
      );
      await applyFreshProfile(user.id, nextProfile);
    } catch (error) {
      setIsOfflineFallback(true);
      devWarn('Could not refresh profile; keeping local data.', error);
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
      devWarn('Could not disable push token before sign out.', error);
    }

    const currentUserId = session?.user.id ?? null;
    const { error: signOutError } = await signOutLocal();
    if (signOutError) throw signOutError;

    await clearVerifiedLocalUser();
    setOfflineUser(null);
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

      async function restoreReadOnlyOfflineShell(): Promise<boolean> {
        const stored = await readVerifiedLocalUser();
        if (!stored) return false;
        const cached = await readCachedProfile(stored.id);
        if (!cached) return false;
        // Do not delay first-time users with a network probe: only previously
        // verified profiles may enter the offline shell.
        const unreachable = await isBackendUnreachable().catch((error) => {
          devWarn('Could not probe backend; offline identity fallback unavailable.', error);
          return false;
        });
        if (!unreachable) return false;
        if (!isMounted || startupRunRef.current !== runId) return false;
        setSession(null);
        setOfflineUser(stored);
        setProfile(cached.profile);
        setUsingCachedProfile(true);
        setLastProfileSyncAt(cached.cachedAt);
        setIsOfflineFallback(true);
        setLoading(false);
        return true;
      }

      try {
        const { data, error } = await withOperationTimeout(
          getCurrentSession(),
          SESSION_BOOT_TIMEOUT_MS,
          'local session',
        );

        if (error) throw error;
        if (!isMounted || startupRunRef.current !== runId) return;

        const nextSession = data.session ?? null;
        if (nextSession?.user) {
          setOfflineUser(null);
          void rememberVerifiedLocalUser(nextSession.user).catch((err) => devWarn('Could not persist verified offline identity.', err));
        }
        setSession(nextSession);

        if (!nextSession?.user) {
          if (await restoreReadOnlyOfflineShell()) return;
          setOfflineUser(null);
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

          void withOperationTimeout(getProfileByUserId(userId), PROFILE_REFRESH_TIMEOUT_MS, 'background profile refresh')
            .then(async (nextProfile) => {
              if (!isMounted || startupRunRef.current !== runId) return;
              await applyFreshProfile(userId, nextProfile);
            })
            .catch((error) => {
              if (!isMounted || startupRunRef.current !== runId) return;
              setIsOfflineFallback(true);
              devWarn('UCAPSA started with cached profile.', error);
            });

          return;
        }

        try {
          const nextProfile = await withOperationTimeout(
            getProfileByUserId(userId),
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
          devWarn('UCAPSA opened without a remote profile; offline fallback active.', error);
        } finally {
          if (isMounted && startupRunRef.current === runId) setLoading(false);
        }
      } catch (error) {
        if (!isMounted || startupRunRef.current !== runId) return;

        // Supabase getSession reads local storage and only needs the network when the
        // stored session requires a refresh. Do not pretend we can safely recover an
        // authenticated identity here when no valid session snapshot was returned.
        devWarn('UCAPSA could not recover the local session.', error);
        if (await restoreReadOnlyOfflineShell()) return;
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

    const { data: listener } = subscribeToAuthState((event, nextSession) => {
      if (!isMounted || event === 'INITIAL_SESSION') return;

      if (!nextSession?.user) {
        const eventAttempt = authEventAttemptRef.current + 1;
        authEventAttemptRef.current = eventAttempt;
        if (event === 'SIGNED_OUT') {
          // A refresh that fails offline can emit SIGNED_OUT. Preserve only
          // locally verified, cached read-only state; never mint a JWT.
          void (async () => {
            const unreachable = await isBackendUnreachable().catch((error) => {
              devWarn('Could not probe backend; offline identity fallback unavailable.', error);
              return false;
            });
            if (!unreachable) {
              await clearVerifiedLocalUser().catch((error) => {
                devWarn('Could not clear offline identity after server-side sign-out.', error);
              });
              return;
            }
            const stored = await readVerifiedLocalUser();
            const cached = stored ? await readCachedProfile(stored.id) : null;
            if (!isMounted || authEventAttemptRef.current !== eventAttempt || !stored || !cached) return;
            setOfflineUser(stored);
            setProfile(cached.profile);
            setUsingCachedProfile(true);
            setLastProfileSyncAt(cached.cachedAt);
            setIsOfflineFallback(true);
            setStartupError(null);
            setLoading(false);
          })();
        }
        setSession(null);
        setProfile(null);
        setStartupError(null);
        setUsingCachedProfile(false);
        setLastProfileSyncAt(null);
        setIsOfflineFallback(false);
        setOfflineUser(null);
        setLoading(false);
        return;
      }

      setOfflineUser(null);
      void rememberVerifiedLocalUser(nextSession.user).catch((err) => devWarn('Could not persist verified offline identity.', err));
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
          const nextProfile = await withOperationTimeout(
            getProfileByUserId(userId),
            PROFILE_REFRESH_TIMEOUT_MS,
            `auth:${event}`,
          );
          if (!isMounted || authEventAttemptRef.current !== eventAttempt) return;
          await applyFreshProfile(userId, nextProfile);
        } catch (error) {
          if (!isMounted || authEventAttemptRef.current !== eventAttempt) return;
          setIsOfflineFallback(true);
          devWarn(`Could not refresh profile after ${event}; keeping local data.`, error);
        }
      })();
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // La cuenta Auth ya está autenticada y el perfil se confirmó en backend.
  // Sólo entonces se intenta vincular fichas provisionales, nunca desde caché offline.
  useEffect(() => {
    const authenticatedUserId = session?.user.id ?? null;
    if (!authenticatedUserId) {
      claimedPreregistrationKeyRef.current = null;
      return;
    }
    // Los eventos de Auth pueden confirmar el contacto después del login.
    // La clave evita reintentos infinitos y permite reintentar si la identidad
    // verificada cambió. Nunca confiar en email/teléfono escritos por el cliente.
    const claimKey = [authenticatedUserId,
      session?.user.email_confirmed_at ?? '',
      session?.user.phone_confirmed_at ?? ''].join('|');
    if (isOfflineFallback || usingCachedProfile ||
        profile?.user_id !== authenticatedUserId ||
        profile.role === 'visitor' ||
        claimedPreregistrationKeyRef.current === claimKey) return;

    claimedPreregistrationKeyRef.current = claimKey;
    void claimMyPreregisteredDogs()
      .then(async (outcome) => {
        if (outcome.linkedDogs > 0) {
          await clearClientReadCache(authenticatedUserId);
          await clearHomeCache(authenticatedUserId);
          // Notificar a Inicio: el primer render pudo ocurrir antes de reclamar.
          if (claimedPreregistrationKeyRef.current === claimKey) {
            setPreregistrationSyncVersion((version) => version + 1);
          }
        }
      })
      .catch((error) => {
        // No bloquear el login si falla el enlace. La sesión jamás pierde permisos.
        if (claimedPreregistrationKeyRef.current === claimKey) {
          claimedPreregistrationKeyRef.current = null;
        }
        devWarn('La vinculación automática de perro está pendiente.', error);
      });
  }, [session?.user.id, session?.user.email_confirmed_at,
    session?.user.phone_confirmed_at, profile?.user_id, profile?.role,
    usingCachedProfile, isOfflineFallback]);

  // On returning to the foreground, try to replace read-only identity with a
  // genuine Supabase session. No login re-prompt is necessary after a transient
  // network outage if the persisted refresh token is still accepted.
  useEffect(() => {
    if (!isOfflineFallback || !offlineUser || session) return;
    let active = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void (async () => {
        if (await isBackendUnreachable().catch((error) => {
          devWarn('Backend reachability unknown; keep offline read-only state.', error);
          return true;
        })) return;
        const { data, error } = await withOperationTimeout(
          getCurrentSession(), SESSION_BOOT_TIMEOUT_MS, 'offline session recovery',
        ).catch((error) => {
          devWarn('Could not restore a Supabase session on foreground.', error);
          return { data: { session: null }, error: new Error('Session still unavailable') };
        });
        if (!active || error) return;
        if (!data.session?.user) {
          // Backend is reachable but there is no valid remotely restorable
          // session. Do not remain indefinitely authenticated via local cache.
          await clearVerifiedLocalUser().catch((cause) => {
            devWarn('Could not clear stale offline identity after reconnect.', cause);
          });
          if (!active) return;
          setOfflineUser(null);
          setProfile(null);
          setLastProfileSyncAt(null);
          setUsingCachedProfile(false);
          setIsOfflineFallback(false);
          return;
        }
        if (data.session.user.id !== offlineUser.id) {
          // Never continue displaying a cached account after a different user
          // authenticates on the device.
          setProfile(null);
          setUsingCachedProfile(false);
          setLastProfileSyncAt(null);
        }
        setOfflineUser(null);
        setSession(data.session);
        setIsOfflineFallback(false);
        void rememberVerifiedLocalUser(data.session.user).catch((error) => {
          devWarn('Could not store identity after reconnection.', error);
        });
        const recoveredUserId = data.session.user.id;
        const recoveryAttempt = authEventAttemptRef.current + 1;
        authEventAttemptRef.current = recoveryAttempt;
        void getProfileByUserId(recoveredUserId).then(async (nextProfile) => {
          if (authEventAttemptRef.current !== recoveryAttempt) return;
          await applyFreshProfile(recoveredUserId, nextProfile);
        }).catch((error) => {
          devWarn('Could not refresh the revalidated user profile; retaining only safe cache.', error);
        });
      })();
    });
    return () => { active = false; subscription.remove(); };
  }, [isOfflineFallback, offlineUser, session]);

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
      preregistrationSyncVersion,
      isAdmin,
      isTrainer,
      isStaff,
      capabilities,
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
      preregistrationSyncVersion,
      isAdmin,
      isTrainer,
      isStaff,
      capabilities,
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
