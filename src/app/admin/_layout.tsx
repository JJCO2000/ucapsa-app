import { Redirect, Stack } from 'expo-router';

import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

export default function AdminLayout() {
  const { isAdmin, loading } = useSession();

  if (loading) return null;
  if (!isAdmin) return <Redirect href="/home" />;

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
      <Stack.Screen name="competition" options={{ title: 'Competencia UCAPSA' }} />
      <Stack.Screen name="competition-constancy" options={{ title: 'Rangos / Constancia' }} />
      <Stack.Screen name="competition-constancy-detail" options={{ title: 'Constancia del perro' }} />
      <Stack.Screen name="competition-seasons" options={{ title: 'Temporadas' }} />
      <Stack.Screen name="competition-season-detail" options={{ title: 'Temporada' }} />
      <Stack.Screen name="competition-season-form" options={{ title: 'Configurar temporada' }} />
      <Stack.Screen name="competition-adjustments" options={{ title: 'Puntos y ajustes' }} />
      <Stack.Screen name="competition-adjustment-detail" options={{ title: 'Ajustes del perro' }} />
      <Stack.Screen name="competition-awards" options={{ title: 'Premios' }} />
      <Stack.Screen name="competition-award-form" options={{ title: 'Otorgar premio' }} />
      <Stack.Screen name="competition-exams" options={{ title: 'Exámenes' }} />
      <Stack.Screen name="competition-exam-detail" options={{ title: 'Examen' }} />
      <Stack.Screen name="competition-exam-form" options={{ title: 'Configurar examen' }} />
      <Stack.Screen name="competition-exam-item-form" options={{ title: 'Ejercicio' }} />
      <Stack.Screen name="competition-exam-attempts" options={{ title: 'Intentos y resultados' }} />
      <Stack.Screen name="competition-exam-attempt-form" options={{ title: 'Nuevo intento' }} />
      <Stack.Screen name="competition-exam-attempt-detail" options={{ title: 'Intento' }} />
      <Stack.Screen name="competition-exam-result-form" options={{ title: 'Resultado' }} />
      <Stack.Screen name="competition-exam-imports" options={{ title: 'Importar Excel' }} />
      <Stack.Screen name="competition-exam-import-detail" options={{ title: 'Lote Excel' }} />
      <Stack.Screen name="points" options={{ title: 'Puntos UCAPSA' }} />
      <Stack.Screen name="tools-communication" options={{ title: 'Comunicacion' }} />
      <Stack.Screen name="tools-administration" options={{ title: 'Administracion' }} />
    </Stack>
  );
}
