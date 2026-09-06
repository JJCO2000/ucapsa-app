import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';

export default function ClientLayout() {
  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const club = format.key === 'member';

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: club ? ucapsaBrand.colors.premiumHero : ucapsaBrand.colors.red },
        headerTintColor: club ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.surface,
        headerTitleStyle: { fontWeight: '900' },
        headerShadowVisible: !club,
      }}
    >
      <Stack.Screen name="membership" options={{ title: club ? 'Club UCAPSA' : 'Membresía' }} />
      <Stack.Screen name="class-detail" options={{ title: 'Clase' }} />
      <Stack.Screen name="attendance-history" options={{ title: 'Asistencias' }} />
      <Stack.Screen name="payment-history" options={{ title: 'Historial de pagos' }} />
      <Stack.Screen name="practice-activity" options={{ title: 'Racha y práctica' }} />
      <Stack.Screen name="member-visits" options={{ title: 'Tus visitas' }} />
      <Stack.Screen name="activity-achievements" options={{ title: 'Insignias de actividad' }} />
    </Stack>
  );
}
