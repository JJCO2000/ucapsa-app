import { Redirect, Stack } from 'expo-router';

import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

export default function TrainerStackLayout() {
  const { isStaff, isAdmin, loading } = useSession();

  if (loading) return null;
  if (!isStaff) return <Redirect href="/home" />;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Entrenamiento',
        headerStyle: { backgroundColor: ucapsaBrand.colors.greenDark },
        headerTintColor: ucapsaBrand.colors.surface,
        headerTitleStyle: { fontWeight: '900' },
      }}
    >
      <Stack.Screen name="roster" options={{ title: 'Clase' }} />
      <Stack.Screen name="dog" options={{ title: 'Perro' }} />
      <Stack.Screen name="exam-attempt" options={{ title: 'Evaluación' }} />
    </Stack>
  );
}
