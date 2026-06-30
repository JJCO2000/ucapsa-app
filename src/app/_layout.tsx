import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { LoadingScreen } from '../components/ui/LoadingScreen';
import { SessionProvider, useSession } from '../hooks/useSession';

function RootNavigator() {
  const { loading } = useSession();

  if (loading) {
    return <LoadingScreen message="Preparando UCAPSA..." />;
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
