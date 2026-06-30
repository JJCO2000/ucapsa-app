import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { supabase } from '../lib/supabase';
import { disableStoredExpoPushToken } from '../services/notifications.service';
import type { AppRole, UserProfile } from '../types/app.types';

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

type SessionProviderProps = {
  children: ReactNode;
};

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Could not load profile:', error.message);
    return null;
  }

  return data as UserProfile | null;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const user = session?.user ?? null;
  const role = profile?.role ?? null;
  const isAdmin = role === 'admin' || role === 'super_admin';

  async function refreshProfile() {
    if (!user) {
      setProfile(null);
      return;
    }

    const nextProfile = await fetchProfile(user.id);
    setProfile(nextProfile);
  }

  async function signOut() {
    try {
      await disableStoredExpoPushToken();
    } catch (error) {
      console.warn('Could not disable push token before sign out:', error instanceof Error ? error.message : error);
    }

    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSession() {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setSession(data.session ?? null);

      if (data.session?.user) {
        const nextProfile = await fetchProfile(data.session.user.id);
        if (isMounted) {
          setProfile(nextProfile);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    }

    loadInitialSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setLoading(true);

      if (nextSession?.user) {
        const nextProfile = await fetchProfile(nextSession.user.id);

        if (!isMounted) {
          return;
        }

        setSession(nextSession);
        setProfile(nextProfile);
      } else {
        setSession(null);
        setProfile(null);
      }

      if (isMounted) {
        setLoading(false);
      }
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
      isAdmin,
      refreshProfile,
      signOut,
    }),
    [session, user, profile, role, loading, isAdmin]
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
