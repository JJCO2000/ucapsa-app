import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  approveAdminPreregistrationLinkRequest, closeAdminPreregistrationLinkRequest, getAdminPreregistrationLinkRequests,
  type LinkReviewRequest,
} from '../../services/preregistration-link-requests.service';

export default function AdminLinkReviewRequestsScreen() {
  const { isAdmin } = useSession();
  const [items, setItems] = useState<LinkReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await getAdminPreregistrationLinkRequests());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron consultar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    if (!isAdmin) return;
    setLoading(true);
    void load();
  }, [isAdmin, load]));

  const close = (item: LinkReviewRequest, decision: 'reviewed' | 'rejected') => {
    if (busyId) return;
    const description = decision === 'reviewed'
      ? 'Se archivará como revisada. Esto NO cambia al titular, los perros ni su historial.'
      : 'Se rechazará esta solicitud. La cuenta actual conservará todos sus registros.';
    Alert.alert('Resolver solicitud', description, [
      { text: 'Cancelar', style: 'cancel' },
      { text: decision === 'reviewed' ? 'Marcar revisada' : 'Rechazar',
        style: decision === 'rejected' ? 'destructive' : 'default',
        onPress: () => { void (async () => {
          try {
            setBusyId(item.id);
            await closeAdminPreregistrationLinkRequest(item.id, decision);
            await load();
          } catch (cause) {
            Alert.alert('No se pudo resolver', cause instanceof Error ? cause.message : 'Revisa la solicitud.');
          } finally { setBusyId(null); }
        })(); },
      },
    ]);
  };

  const approve = (item: LinkReviewRequest) => {
    if (busyId) return;
    Alert.alert('Autorizar cambio de titular',
      '¿Autorizar que estos perros e inscripciones pasen a la cuenta solicitante? El sistema conservará su historial y rechazará automáticamente expedientes con pagos, asistencias nuevas o dependencias que requieran conciliación.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, autorizar', onPress: () => { void (async () => {
          try {
            setBusyId(item.id);
            const count = await approveAdminPreregistrationLinkRequest(item.id);
            await load();
            Alert.alert('Expediente reasignado', `${count} perro(s) fueron vinculados a la cuenta autorizada, conservando el historial.`);
          } catch (cause) {
            Alert.alert('Se requiere revisión manual',
              cause instanceof Error ? cause.message : 'El expediente no fue modificado.');
          } finally { setBusyId(null); }
        })(); } },
      ],
    );
  };

  if (!isAdmin) return <Redirect href="/home" />;
  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {
      setLoading(true); void load();
    }} tintColor={ucapsaBrand.colors.red} />}>
      <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.link}>Preinscripciones</Text>
      </Pressable>
      <Text style={styles.heading}>Solicitudes de vinculación</Text>
      <Text style={styles.helper}>Cuando otra cuenta reclama un expediente ya vinculado, aparece aquí. Nunca se reasigna automáticamente.</Text>
      {loading ? <ActivityIndicator color={ucapsaBrand.colors.red} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && items.length === 0 ? <Text style={styles.helper}>No hay solicitudes pendientes.</Text> : null}
      {items.map(item => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.name}>{item.requesterName || item.requesterEmail || 'Cuenta solicitante'}</Text>
          <Text style={styles.helper}>Cuenta solicitante: {item.requesterEmail || item.requesterUserId}</Text>
          <Text style={styles.helper}>Expediente original: {item.ownerName}</Text>
          <Text style={styles.helper}>Perros vinculados: {item.dogCount}</Text>
          <Text style={styles.helper}>Solicitud: {item.requestedAt.slice(0, 10)}</Text>
          <View style={styles.actions}>
            <Pressable disabled={busyId !== null} onPress={() => approve(item)}
              style={styles.action} accessibilityRole="button">
              <Text style={styles.actionText}>Aprobar y vincular</Text>
            </Pressable>
            <Pressable disabled={busyId !== null} onPress={() => close(item, 'reviewed')}
              style={styles.action} accessibilityRole="button">
              <Text style={styles.actionText}>Marcar revisada</Text>
            </Pressable>
            <Pressable disabled={busyId !== null} onPress={() => close(item, 'rejected')}
              style={styles.action} accessibilityRole="button">
              <Text style={styles.reject}>Rechazar</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>La aprobación transfiere únicamente expedientes sin actividad posterior incompatible. Si la operación se bloquea, los datos permanecen con su titular actual.</Text>
        </View>
      ))}
    </KeyboardAwareScreen>
  );
}
const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  link: { color: ucapsaBrand.colors.redDark, fontWeight: '800' },
  heading: { fontSize: 25, fontWeight: '900', color: ucapsaBrand.colors.text, marginBottom: 8 },
  helper: { fontSize: 12, lineHeight: 19, color: ucapsaBrand.colors.muted, marginTop: 5 },
  error: { fontSize: 13, color: ucapsaBrand.colors.danger, marginVertical: 10 },
  card: { backgroundColor: ucapsaBrand.colors.surface, borderColor: ucapsaBrand.colors.border,
    borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 12 },
  name: { fontSize: 16, fontWeight: '900', color: ucapsaBrand.colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  action: { padding: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 10 },
  actionText: { fontWeight: '800', color: ucapsaBrand.colors.greenDark },
  reject: { fontWeight: '800', color: ucapsaBrand.colors.danger },
});
