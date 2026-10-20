import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { PreregistrationLinkPrompt } from '../components/domain/PreregistrationLinkPrompt';
import { WebAppShell } from '../components/layout/WebAppShell';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { devWarn } from '../lib/client-diagnostics';
import { useNotificationNavigation } from '../hooks/useNotificationNavigation';
import { SessionProvider, useSession } from '../hooks/useSession';
import { MemberAppearanceProvider } from '../hooks/useMemberAppearance';
import { flushPendingAttendanceOperations } from '../services/attendance-sync.service';
import { warmClientOfflineData } from '../services/client-offline-sync.service';
import { flushPendingPracticeSessions } from '../services/practice.service';
import { flushPendingValueExposures } from '../services/value-exposure-outbox.service';

function RootNavigator() {
  const { loading, startupError, retryStartup, user, isStaff, isTrainer, isOfflineFallback } = useSession();
  const warmedUserRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  useNotificationNavigation(!loading && !startupError && !isOfflineFallback && Boolean(user) && (!isStaff || isTrainer));

  useEffect(() => {
    if (loading || startupError || isOfflineFallback || !user || isStaff || warmedUserRef.current === user.id) return;
    warmedUserRef.current = user.id;

    void warmClientOfflineData(user.id).catch((error) => {
      devWarn('Could not warm UCAPSA offline data.', error);
    });
  }, [isOfflineFallback, isStaff, loading, startupError, user]);

  useEffect(() => {
    if (loading || startupError || isOfflineFallback || !user || isStaff) return;

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
  }, [isOfflineFallback, isStaff, loading, startupError, user]);

  if (loading) {
    return <LoadingScreen message="Preparando UCAPSA..." />;
  }

  if (startupError) {
    return <LoadingScreen message={startupError} onRetry={retryStartup} />;
  }

  return (
    <WebAppShell>
      <Stack screenOptions={{ headerShown: false }} />
      <PreregistrationLinkPrompt />
    </WebAppShell>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <MemberAppearanceProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </MemberAppearanceProvider>
    </SessionProvider>
  );
}
