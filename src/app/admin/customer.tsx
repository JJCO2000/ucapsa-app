import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getAdminCustomerRecord, type AdminCustomerRecord } from '../../services/admin-customer.service';

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

function membershipLabel(status: string | null | undefined) {
  if (status === 'active') return 'Activa';
  if (status === 'pending') return 'Pendiente';
  if (status === 'expired') return 'Vencida';
  if (status === 'rejected') return 'Rechazada';
  if (status === 'cancelled') return 'Cancelada';
  return 'Sin membresia';
}

export default function AdminCustomerScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError('');
      setRecord(await getAdminCustomerRecord(userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el cliente.');
      setRecord(null);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (!userId) return undefined;
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [load, userId]));

  const actualAttendances = useMemo(() => record?.enrollments.reduce((sum, item) => sum + item.attendances.length, 0) ?? 0, [record]);
  const pendingBalance = useMemo(() => {
    if (!record) return 0;
    const paid = new Map<string, number>();
    for (const payment of record.payments) {
      if (!payment.obligation_id || payment.status !== 'paid') continue;
      paid.set(payment.obligation_id, (paid.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
    }
    return record.obligations
      .filter((item) => !item.cancelled_at)
      .reduce((sum, item) => sum + Math.max(0, Number(item.amount ?? 0) - (paid.get(item.id) ?? 0)), 0);
  }, [record]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!userId) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.center}>
          <MaterialIcons name="person-search" size={38} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.title}>Selecciona un cliente</Text>
          <Text style={styles.muted}>Abre esta vista desde Clientes.</Text>
          <Pressable style={styles.primary} onPress={() => router.replace('/admin-clients' as never)}><Text style={styles.primaryText}>Ir a Clientes</Text></Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando cliente...</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => { setLoading(true); void load().finally(() => setLoading(false)); }}><Text style={styles.primaryText}>Reintentar</Text></Pressable></View> : null}

      {record ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.kicker}>{record.membership?.status === 'active' ? 'Socio' : 'Cliente'}</Text>
            <Text style={styles.heroTitle}>{record.profile.full_name || record.profile.email || 'Cliente UCAPSA'}</Text>
            <Text style={styles.heroSubtitle}>{record.profile.email || record.profile.phone || 'Sin contacto'}</Text>
          </View>

          <View style={styles.metrics}>
            <Metric label="Membresia" value={membershipLabel(record.membership?.status)} />
            <Metric label="Programas" value={String(record.enrollments.length)} />
            <Metric label="Asistencias" value={String(actualAttendances)} />
            {record.membership ? <Metric label="Visitas socio" value={String(record.memberVisits.length)} /> : null}
            <Metric label="Saldo" value={money(pendingBalance)} small />
          </View>

          <Text style={styles.sectionTitle}>Informacion</Text>
          <View style={styles.card}>
            <MenuRow icon="person" title="Datos" subtitle="Nombre, contacto y perfil" section="profile" userId={userId} />
            <MenuRow icon="badge" title="Membresia" subtitle="Estado, vigencia, numero y visitas" section="membership" userId={userId} />
            <MenuRow icon="school" title="Clases" subtitle="Programas, nivel, horario y tarjeta" section="classes" userId={userId} />
            <MenuRow icon="fact-check" title="Asistencias" subtitle="Historial real de clases" section="attendance" userId={userId} />
            <MenuRow icon="payments" title="Pagos" subtitle="Obligaciones, pagos y saldo" section="payments" userId={userId} last />
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, small && styles.metricValueSmall]} numberOfLines={1}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function MenuRow({ icon, title, subtitle, section, userId, last = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; section: string; userId: string; last?: boolean }) {
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={() => router.push(`/admin/customer-section?userId=${encodeURIComponent(userId)}&section=${section}` as never)}>
      <View style={styles.iconBox}><MaterialIcons name={icon} size={21} color={ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>
      <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  error: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 16, gap: 8 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 16, fontWeight: '900' },
  hero: { backgroundColor: ucapsaBrand.colors.red, borderRadius: 24, padding: 18, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redSoftStrong, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { color: ucapsaBrand.colors.surface, fontSize: 27, fontWeight: '900', marginTop: 3 },
  heroSubtitle: { color: ucapsaBrand.colors.redSoft, fontSize: 13, marginTop: 4, fontWeight: '700' },
  title: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  primary: { marginTop: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 16, paddingVertical: 12 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  metric: { width: '48%', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  metricValueSmall: { fontSize: 15 },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800', marginTop: 3 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 9 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
});
