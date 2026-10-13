import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getAdminProgramInterestRequests,
  updateAdminProgramInterestRequest,
  type AdminProgramInterestRequest,
} from '../../services/program-interest.service';

export default function AdminProgramInterestsScreen() {
  const { isAdmin } = useSession();
  const [requests, setRequests] = useState<AdminProgramInterestRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const rows = await getAdminProgramInterestRequests();
      setRequests(rows);
      setError(null);
    } catch {
      setError('No pudimos verificar las solicitudes; revisa la conexión y que la migración esté aplicada.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function changeStatus(row: AdminProgramInterestRequest, status: 'contacted' | 'closed') {
    if (busyId) return;
    setBusyId(row.id);
    try {
      await updateAdminProgramInterestRequest(row.id, status);
      await load();
    } catch {
      Alert.alert('No se guardó el seguimiento', 'Intenta nuevamente. La solicitud no se ha modificado.');
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={{ color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' }}>ADMINISTRACIÓN · PRIORIDAD URGENTE</Text>
      <Text style={{ color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginVertical: 8 }}>Solicitudes de entrenamiento</Text>
      <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 14, marginBottom: 16 }}>
        Puppy School y Comandos. Atiende primero las pendientes; ninguna solicitud crea inscripciones ni asistencias.
      </Text>
      {loading ? <Text>Consultando solicitudes…</Text> : null}
      {error ? <Text style={{ color: ucapsaBrand.colors.red, marginBottom: 15 }}>{error}</Text> : null}
      {!loading && !error && requests.length === 0 ? <Text>No hay solicitudes abiertas.</Text> : null}
      {requests.map((row) => (
        <View key={row.id} style={{ borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder,
          borderRadius: 20, padding: 16, backgroundColor: ucapsaBrand.colors.surface, marginBottom: 12, gap: 9 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: ucapsaBrand.colors.redDark, fontWeight: '900' }}>
              {row.program_code === 'puppy' ? 'Puppy School' : 'Comandos'}
            </Text>
            <Text style={{ color: ucapsaBrand.colors.red, fontWeight: '900', fontSize: 12 }}>
              {row.status === 'pending' ? 'URGENTE · NUEVA' : 'SEGUIMIENTO'}
            </Text>
          </View>
          <Text style={{ color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '800' }}>{row.dogName}</Text>
          <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 14 }}>{row.customerName} · {row.customerPhone ?? 'Teléfono no registrado'}</Text>
          <Text style={{ color: ucapsaBrand.colors.muted, fontSize: 12 }}>Recibida: {new Date(row.created_at).toLocaleDateString('es-MX')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push(('/admin/customer?userId=' + encodeURIComponent(row.user_id)) as never)}
            style={{ paddingVertical: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialIcons name="person-search" size={20} color={ucapsaBrand.colors.redDark} />
            <Text style={{ color: ucapsaBrand.colors.redDark, fontWeight: '800' }}>Abrir cliente</Text>
          </Pressable>
          {row.status === 'pending' ? (
            <Pressable accessibilityRole="button" disabled={busyId === row.id}
              onPress={() => void changeStatus(row, 'contacted')}
              style={{ minHeight: 50, backgroundColor: ucapsaBrand.colors.red, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: ucapsaBrand.colors.surface, fontWeight: '900' }}>Marcar en seguimiento</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" disabled={busyId === row.id}
              onPress={() => Alert.alert('Cerrar seguimiento', '¿Ya atendiste esta solicitud?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Cerrar', onPress: () => void changeStatus(row, 'closed') },
              ])}
              style={{ minHeight: 50, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: ucapsaBrand.colors.text, fontWeight: '800' }}>Cerrar seguimiento</Text>
            </Pressable>
          )}
        </View>
      ))}
    </KeyboardAwareScreen>
  );
}
