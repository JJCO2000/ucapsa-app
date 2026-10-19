import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

/**
 * Appears only after a verified contact match OR a specific Admin approval.
 * No tutor, dog or phone details are leaked before user consent.
 */
export function PreregistrationLinkPrompt() {
  const {
    user, isOfflineFallback, preregistrationLinkOffer: count,
    preregistrationLinkBusy: busy, confirmPreregistrationLink,
    dismissPreregistrationLink,
  } = useSession();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (count === null) setError(null); }, [count]);
  const visible = Boolean(user && !isOfflineFallback && count !== null && count > 0);

  async function confirm() {
    if (busy) return;
    setError(null);
    try {
      await confirmPreregistrationLink();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo vincular. Intenta más tarde.');
    }
  }

  return (
    <Modal transparent visible={visible} animationType="fade"
      onRequestClose={dismissPreregistrationLink}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.head}>
            <MaterialIcons name="pets" size={22} color={ucapsaBrand.colors.greenDark} />
            <Text style={styles.title}>Se encontraron nuevos registros</Text>
          </View>
          <Text style={styles.body}>
            UCAPSA encontró {count === 1 ? 'un perro' : `${count ?? 0} perros`}
            {' '}preinscrito{count === 1 ? '' : 's'} autorizado{count === 1 ? '' : 's'}
            para esta cuenta por Administración o por un contacto verificado.
            ¿Deseas vincular {count === 1 ? 'su expediente' : 'sus expedientes'} a esta cuenta?
          </Text>
          <Text style={styles.note}>
            Se conservarán niveles, horarios e historial de asistencias.
            No se generan pagos ni membresías nuevas.
          </Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy}
            style={[styles.primary, busy && styles.disabled]} onPress={() => void confirm()}>
            {busy ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> : null}
            <Text style={styles.primaryText}>{busy ? 'Vinculando…' : 'Sí, vincular expedientes'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary}
            onPress={dismissPreregistrationLink}>
            <Text style={styles.secondaryText}>Ahora no</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center',
    padding: 22 },
  dialog: { backgroundColor: ucapsaBrand.colors.surface, borderRadius: 18, padding: 20, gap: 14,
    borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { fontSize: 19, fontWeight: '900', color: ucapsaBrand.colors.text, flex: 1 },
  body: { fontSize: 14, lineHeight: 21, color: ucapsaBrand.colors.text },
  note: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 19 },
  error: { color: ucapsaBrand.colors.danger, fontSize: 12 },
  primary: { flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.greenDark, borderRadius: 12, minHeight: 48 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  secondary: { alignItems: 'center', padding: 11 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
