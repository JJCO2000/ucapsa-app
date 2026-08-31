import { ucapsaBrand } from '../../constants/brand';
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Administracion',
        headerStyle: { backgroundColor: ucapsaBrand.colors.red },
        headerTintColor: ucapsaBrand.colors.surface,
        headerTitleStyle: { fontWeight: '900' },
      }}
    >
      <Stack.Screen name="customer" options={{ title: 'Cliente' }} />
      <Stack.Screen name="customer-section" options={{ title: 'Cliente' }} />
      <Stack.Screen name="customer-profile-edit" options={{ title: 'Editar datos' }} />
      <Stack.Screen name="customer-membership" options={{ title: 'Membresia' }} />
      <Stack.Screen name="customer-class" options={{ title: 'Clase' }} />
      <Stack.Screen name="customer-attendance" options={{ title: 'Asistencias' }} />
      <Stack.Screen name="customer-payments" options={{ title: 'Pagos' }} />
      <Stack.Screen name="classes" options={{ title: 'Clases' }} />
      <Stack.Screen name="class-schedules" options={{ title: 'Horarios' }} />
      <Stack.Screen name="class-cancellations" options={{ title: 'Cancelaciones' }} />
      <Stack.Screen name="users" options={{ title: 'Clientes' }} />
      <Stack.Screen name="members" options={{ title: 'Membresias' }} />
      <Stack.Screen name="scanner" options={{ title: 'Escanear' }} />
      <Stack.Screen name="attendance-qr" options={{ title: 'QR de asistencia' }} />
      <Stack.Screen name="payments" options={{ title: 'Pagos' }} />
      <Stack.Screen name="payment-settings" options={{ title: 'Configuracion bancaria' }} />
      <Stack.Screen name="announcements" options={{ title: 'Anuncios' }} />
      <Stack.Screen name="events" options={{ title: 'Eventos' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notificaciones' }} />
      <Stack.Screen name="tools-communication" options={{ title: 'Comunicacion' }} />
      <Stack.Screen name="tools-administration" options={{ title: 'Administracion' }} />
    </Stack>
  );
}
