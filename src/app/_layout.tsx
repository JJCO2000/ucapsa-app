import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { LoadingScreen } from '../components/ui/LoadingScreen';
import { SessionProvider, useSession } from '../hooks/useSession';
import { flushPendingClientWrites, warmClientOfflineData } from '../services/client-offline-sync.service';

function RootNavigator() {
  const { loading, startupError, retryStartup, user, isAdmin } = useSession();
  const warmedUserRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (loading || startupError || !user || isAdmin || warmedUserRef.current === user.id) return;
    warmedUserRef.current = user.id;

    void warmClientOfflineData(user.id).catch((error) => {
      console.warn('Could not warm UCAPSA offline data:', error);
    });
  }, [isAdmin, loading, startupError, user]);

  useEffect(() => {
    if (loading || startupError || !user || isAdmin) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState !== 'active' || previousState === 'active') return;

      void flushPendingClientWrites(user.id).catch((error) => {
        console.warn('Could not retry UCAPSA offline queues:', error);
      });
    });

    return () => subscription.remove();
  }, [isAdmin, loading, startupError, user]);

  if (loading) {
    return <LoadingScreen message="Preparando UCAPSA..." />;
  }

  if (startupError) {
    return <LoadingScreen message={startupError} onRetry={retryStartup} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </SessionProvider>
  );
}
