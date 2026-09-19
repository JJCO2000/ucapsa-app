import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { LoadingScreen } from '../components/ui/LoadingScreen';
import { devWarn } from '../lib/client-diagnostics';
import { SessionProvider, useSession } from '../hooks/useSession';
import { flushPendingAttendanceOperations } from '../services/attendance-outbox.service';
import { warmClientOfflineData } from '../services/client-offline-sync.service';
import { flushPendingPracticeSessions } from '../services/practice.service';
import { flushPendingValueExposures } from '../services/value-exposure-outbox.service';

function RootNavigator() {
  const { loading, startupError, retryStartup, user, isAdmin } = useSession();
  const warmedUserRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (loading || startupError || !user || isAdmin || warmedUserRef.current === user.id) return;
    warmedUserRef.current = user.id;

    void warmClientOfflineData(user.id).catch((error) => {
      devWarn('Could not warm UCAPSA offline data.', error);
    });
  }, [isAdmin, loading, startupError, user]);

  useEffect(() => {
    if (loading || startupError || !user || isAdmin) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState !== 'active' || previousState === 'active') return;

      void Promise.allSettled([
        flushPendingAttendanceOperations(user.id),
        flushPendingPracticeSessions(user.id),
        flushPendingValueExposures(user.id),
      ]).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          devWarn('Could not retry one or more UCAPSA offline queues.');
        }
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
