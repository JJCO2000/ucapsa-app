import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getPrivacyNoticeMissingFields,
  getPrivacyNoticesAdmin,
  type PrivacyNotice,
} from '../../services/privacy-notice.service';

function statusLabel(status: string) {
  if (status === 'published') return 'Publicado';
  if (status === 'retired') return 'Retirado';
  return 'Borrador';
}

export default function PrivacyNoticesAdminScreen() {
  const { role } = useSession();
  const isSuperAdmin = role === 'super_admin';
  const [rows, setRows] = useState<PrivacyNotice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      setRows(await getPrivacyNoticesAdmin());
    } catch (cause) {
      Alert.alert('No se pudieron cargar avisos', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  if (!isSuperAdmin) return <Redirect href="/admin/tools-administration" />;

  const published = rows.find((row) => row.status === 'published') ?? null;

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Superadmin · Privacidad</Text>
          <Text style={styles.title}>Avisos de privacidad</Text>
          <Text style={styles.subtitle}>Administra versiones. Un borrador incompleto no puede publicarse y una versión publicada no se edita.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nueva versión"
          style={styles.add}
          onPress={() => router.push('/admin/privacy-notice-form' as never)}
        >
          <MaterialIcons name="add" size={22} color={ucapsaBrand.colors.surface} />
        </Pressable>
      </View>

      <View style={published ? styles.okBox : styles.warningBox}>
        <MaterialIcons
          name={published ? 'verified-user' : 'warning-amber'}
          size={21}
          color={published ? ucapsaBrand.colors.greenDark : ucapsaBrand.colors.redDark}
        />
        <Text style={styles.boxText}>
          {published
            ? `Versión publicada: ${published.version}. La pantalla pública usa únicamente esta versión.`
            : 'No existe un aviso publicado. No conectes todavía el alta de cuentas a un texto legal inexistente.'}
        </Text>
      </View>

      {loading ? <Text style={styles.muted}>Cargando versiones...</Text> : null}

      {!loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="policy" size={32} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.emptyTitle}>Sin versiones</Text>
          <Text style={styles.muted}>Crea un borrador con los datos jurídicos reales de UCAPSA.</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {rows.map((row, index) => {
          const missing = getPrivacyNoticeMissingFields(row);
          return (
            <Pressable
              key={row.id}
              style={[styles.row, index === rows.length - 1 && styles.rowLast]}
              onPress={() => router.push(`/admin/privacy-notice-form?id=${encodeURIComponent(row.id)}` as never)}
            >
              <View style={styles.icon}>
                <MaterialIcons name="description" size={20} color={ucapsaBrand.colors.redDark} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle}>Versión {row.version}</Text>
                  <Text style={[styles.pill, row.status === 'published' && styles.pillPublished, row.status === 'retired' && styles.pillRetired]}>
                    {statusLabel(row.status)}
                  </Text>
                </View>
                <Text style={styles.rowMeta}>
                  {row.status === 'draft'
                    ? missing.length === 0
                      ? 'Completo · listo para revisión/publicación'
                      : `${missing.length} campo(s) obligatorio(s) pendiente(s)`
                    : row.published_at
                      ? `Publicado ${new Date(row.published_at).toLocaleDateString('es-MX')}`
                      : 'Versión histórica'}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.publicButton} onPress={() => router.push('/privacy' as never)}>
        <MaterialIcons name="public" size={19} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.publicButtonText}>Ver pantalla pública</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  add: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.red },
  okBox: { flexDirection: 'row', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.greenSoft, backgroundColor: ucapsaBrand.colors.surface, padding: 12, marginBottom: 14 },
  warningBox: { flexDirection: 'row', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, padding: 12, marginBottom: 14 },
  boxText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 28 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  rowLast: { borderBottomWidth: 0 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  pill: { borderRadius: 999, overflow: 'hidden', backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '900' },
  pillPublished: { backgroundColor: ucapsaBrand.colors.greenSoft, color: ucapsaBrand.colors.greenDark },
  pillRetired: { backgroundColor: ucapsaBrand.colors.graySoft, color: ucapsaBrand.colors.grayDark },
  publicButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 12, marginTop: 12 },
  publicButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
});
