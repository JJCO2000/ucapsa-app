import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { LoadingScreen } from '../components/ui/LoadingScreen';
import { SessionProvider, useSession } from '../hooks/useSession';
import { warmClientOfflineData } from '../services/client-offline-sync.service';

function RootNavigator() {
  const { loading, startupError, retryStartup, user, isAdmin } = useSession();
  const warmedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || startupError || !user || isAdmin || warmedUserRef.current === user.id) return;
    warmedUserRef.current = user.id;

    void warmClientOfflineData(user.id).catch((error) => {
      console.warn('Could not warm UCAPSA offline data:', error);
    });
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
