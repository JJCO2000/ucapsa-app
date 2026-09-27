import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getAdminClientFollowupRows,
  type AdminClientFollowupRow,
} from '../../services/admin-client-followups.service';
import {
  DEFAULT_READ_TIMEOUT_MS,
  friendlyReadError,
  withOperationTimeout,
} from '../../utils/async.utils';

function dateLabel(value: string | null) {
  if (!value) return 'Sin fecha';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export default function AdminClientFollowupsScreen() {
  const { isAdmin } = useSession();
  const [rows, setRows] = useState<AdminClientFollowupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    const nextRows = await withOperationTimeout(
      getAdminClientFollowupRows(),
      DEFAULT_READ_TIMEOUT_MS,
      'admin-client-followups-load',
    );
    setRows(nextRows);
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return undefined;
    setLoading(true);
    void load()
      .catch(() => setError(friendlyReadError('No se pudo actualizar el seguimiento de clientes.')))
      .finally(() => setLoading(false));
    return undefined;
  }, [isAdmin, load]));

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch {
      setError(friendlyReadError('No se pudo actualizar el seguimiento de clientes.'));
    } finally {
      setRefreshing(false);
    }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}
    >
      <View style={styles.header}>
        <Text style={styles.kicker}>Admin · Clientes</Text>
        <Text style={styles.title}>Seguimiento</Text>
        <Text style={styles.subtitle}>
          Perros que requieren una acción comercial u operativa.
        </Text>
      </View>

      <View style={styles.ruleCard}>
        <View style={styles.ruleRow}>
          <MaterialIcons name="school" size={19} color={ucapsaBrand.colors.danger} />
          <Text style={styles.ruleText}><Text style={styles.ruleStrong}>14 días:</Text> Puppy terminado sin una inscripción posterior.</Text>
        </View>
        <View style={styles.ruleRow}>
          <MaterialIcons name="event-busy" size={19} color={ucapsaBrand.colors.danger} />
          <Text style={styles.ruleText}><Text style={styles.ruleStrong}>30 días:</Text> sin ninguna asistencia registrada.</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Buscando clientes para seguimiento...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>No se pudo actualizar</Text>
          <Text style={styles.muted}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void refresh()}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <View style={styles.allClear}>
          <MaterialIcons name="check-circle" size={30} color={ucapsaBrand.colors.success} />
          <Text style={styles.allClearTitle}>Sin seguimientos pendientes</Text>
          <Text style={styles.muted}>Ningún perro cumple ahora las reglas de 14 o 30 días.</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {rows.map((row) => (
          <Pressable
            key={row.dogId}
            style={({ pressed }) => [styles.followupCard, pressed && styles.pressed]}
            onPress={() => router.push(`/admin/customer?userId=${encodeURIComponent(row.userId)}` as never)}
          >
            <View style={styles.cardTop}>
              <View style={styles.alertIcon}>
                <MaterialIcons name="priority-high" size={20} color={ucapsaBrand.colors.surface} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.dogName}>{row.dogName}</Text>
                <Text style={styles.customerName}>{row.customerName}</Text>
              </View>
              <View style={styles.redPill}><Text style={styles.redPillText}>Seguimiento</Text></View>
            </View>

            <View style={styles.reasons}>
              {row.puppyNoContinuity ? (
                <View style={styles.reason}>
                  <MaterialIcons name="school" size={17} color={ucapsaBrand.colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reasonTitle}>Puppy sin continuidad</Text>
                    <Text style={styles.reasonText}>
                      Terminó Puppy hace {row.puppyDaysSinceCompletion} días
                      {row.puppyCompletedOn ? ` · ${dateLabel(row.puppyCompletedOn)}` : ''} y no tiene una inscripción posterior.
                    </Text>
                  </View>
                </View>
              ) : null}

              {row.inactive30d ? (
                <View style={styles.reason}>
                  <MaterialIcons name="event-busy" size={17} color={ucapsaBrand.colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reasonTitle}>30 días sin asistencia</Text>
                    <Text style={styles.reasonText}>
                      Última asistencia hace {row.inactivityDays} días
                      {row.lastAttendanceDate ? ` · ${dateLabel(row.lastAttendanceDate)}` : ''}.
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.contactLine}>
              <Text style={styles.contact} numberOfLines={1}>
                {row.customerPhone || row.customerEmail || 'Sin contacto registrado'}
              </Text>
              <Text style={styles.openText}>Abrir cliente</Text>
              <MaterialIcons name="chevron-right" size={20} color={ucapsaBrand.colors.danger} />
            </View>
          </Pressable>
        ))}
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900', marginTop: 2 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 4 },
  ruleCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14, gap: 9, marginBottom: 15 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ruleText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  ruleStrong: { color: ucapsaBrand.colors.danger, fontWeight: '900' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  errorBox: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14, gap: 7 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  retry: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  allClear: { alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, backgroundColor: ucapsaBrand.colors.successSoft, padding: 22 },
  allClearTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  list: { gap: 10 },
  followupCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.danger },
  dogName: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  customerName: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800', marginTop: 1 },
  redPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.danger, paddingHorizontal: 9, paddingVertical: 5 },
  redPillText: { color: ucapsaBrand.colors.surface, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  reasons: { gap: 8, marginTop: 12 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, padding: 10 },
  reasonTitle: { color: ucapsaBrand.colors.danger, fontSize: 12, fontWeight: '900' },
  reasonText: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  contactLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11 },
  contact: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '700' },
  openText: { color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
