import { ucapsaBrand } from '../../constants/brand';
import { Stack } from 'expo-router';

export default function ClientLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: ucapsaBrand.colors.red },
        headerTintColor: ucapsaBrand.colors.surface,
        headerTitleStyle: { fontWeight: '900' },
      }}
    >
      <Stack.Screen name="membership" options={{ title: 'Membresia' }} />
      <Stack.Screen name="class-detail" options={{ title: 'Clase' }} />
      <Stack.Screen name="attendance-history" options={{ title: 'Asistencias' }} />
      <Stack.Screen name="payment-history" options={{ title: 'Historial de pagos' }} />
    </Stack>
  );
}
