import { Stack } from 'expo-router';

export default function ClientLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#C91F37' },
        headerTintColor: '#ffffff',
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
