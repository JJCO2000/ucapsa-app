import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';
import { UCAPSA_ACCOUNT_DELETION_PUBLIC_URL } from '../constants/legal';
import { getPublishedPrivacyNotice, type PrivacyNotice } from '../services/privacy-notice.service';

export default function PrivacyNoticeScreen() {
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showIntegral, setShowIntegral] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRunRef = useRef(0);

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    setLoading(true);
    setError(null);
    // Fail closed: never show an old legal notice during a new verification.
    setNotice(null);
    try {
      const published = await getPublishedPrivacyNotice();
      if (runId !== loadRunRef.current) return;
      setNotice(published);
    } catch (cause) {
      if (runId !== loadRunRef.current) return;
      setNotice(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el aviso.');
    } finally {
      if (runId === loadRunRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" style={styles.back} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>UCAPSA · Privacidad</Text>
          <Text style={styles.title}>Aviso de privacidad</Text>
        </View>
      </View>

      {loading ? <View style={styles.loadingRow}>
        <ActivityIndicator color={ucapsaBrand.colors.red} />
        <Text style={styles.muted}>Consultando aviso publicado…</Text>
      </View> : null}

      {!loading && error ? (
        <View style={styles.warning}>
          <MaterialIcons name="error-outline" size={21} color={ucapsaBrand.colors.danger} />
          <View style={styles.warningContent}>
            <Text style={styles.warningText}>No se pudo consultar el aviso publicado. {error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Reintentar aviso de privacidad"
              style={styles.retry} onPress={() => { void refresh(); }}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!loading && !error && !notice ? (
        <View style={styles.warning}>
          <MaterialIcons name="policy" size={21} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.warningText}>UCAPSA aún no tiene una versión publicada en la app. No se mostrará texto legal inventado ni incompleto.</Text>
        </View>
      ) : null}

      {!loading && !error && notice ? (
        <>
          <View style={styles.summary}>
            <Text style={styles.version}>Versión {notice.version}</Text>
            {notice.effective_from ? (
              <Text style={styles.muted}>Vigente desde {new Date(notice.effective_from).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</Text>
            ) : null}
            <Text style={styles.sectionTitle}>Aviso simplificado</Text>
            <Text style={styles.summaryText}>{notice.simplified_notice}</Text>
          </View>

          <View style={styles.contactCard}>
            <Text style={styles.sectionTitle}>Responsable y contacto</Text>
            <Text style={styles.body}>{notice.responsible_name}</Text>
            <Text style={styles.body}>{notice.contact_email}</Text>
            <Text style={styles.muted}>El aviso completo incluye domicilio, finalidades, derechos ARCO, transferencias y conservación de datos.</Text>
          </View>

          <Pressable accessibilityRole="button"
            accessibilityLabel={showIntegral ? 'Ocultar aviso integral' : 'Leer aviso integral'}
            accessibilityState={{ expanded: showIntegral }}
            style={styles.expandButton} onPress={() => setShowIntegral((current) => !current)}>
            <Text style={styles.expandText}>{showIntegral ? 'Ocultar aviso integral' : 'Leer aviso integral completo'}</Text>
            <MaterialIcons name={showIntegral ? 'expand-less' : 'expand-more'} size={22} color={ucapsaBrand.colors.redDark} />
          </Pressable>
          {showIntegral ? (
            <View style={styles.integral}>
              <Text style={styles.sectionTitle}>Aviso integral vigente</Text>
              <Text style={styles.body}>{notice.integral_notice}</Text>
            </View>
          ) : null}

          <Pressable accessibilityRole="link" accessibilityLabel="Consultar cómo eliminar mi cuenta"
            style={styles.deleteLink} onPress={() => {
              void Linking.openURL(UCAPSA_ACCOUNT_DELETION_PUBLIC_URL).catch(() => {
                Alert.alert('No se pudo abrir', 'Puedes solicitar la eliminación de tu cuenta escribiendo a ucapsa84@gmail.com.');
              });
            }}>
            <Text style={styles.deleteLinkText}>Cómo eliminar mi cuenta y mis datos</Text>
            <MaterialIcons name="open-in-new" size={18} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  warningContent: { flex: 1, gap: 10 },
  retry: { alignSelf: 'flex-start', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13,
    backgroundColor: ucapsaBrand.colors.redSoft },
  retryText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  warning: { flexDirection: 'row', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceAlt, padding: 13 },
  warningText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  summary: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 14 },
  version: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', marginBottom: 4 },
  summaryText: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 21, fontWeight: '700', marginTop: 10 },
  contactCard: { gap: 5, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border, paddingVertical: 14, marginBottom: 12 },
  expandButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 15 },
  expandText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  deleteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 15, padding: 14, marginTop: 10, marginBottom: 15 },
  deleteLinkText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900', marginBottom: 5 },
  body: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 19, fontWeight: '700' },
  integral: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginTop: 16, marginBottom: 20 },
});
