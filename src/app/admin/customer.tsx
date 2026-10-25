import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useAdminCustomerDetail } from '../../hooks/useAdminCustomerDetail';
import { useAdminCustomerFollowups } from '../../hooks/useAdminCustomerFollowups';
import { useSession } from '../../hooks/useSession';

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
  const { isAdmin } = useSession();
  const { record, loading, refreshing, error, refresh } = useAdminCustomerDetail(userId);
  const { rows: followups, loading: followupLoading, error: followupError,
    refresh: refreshFollowups } = useAdminCustomerFollowups(userId, isAdmin);
  const refreshAll = () => { void Promise.all([refresh(), refreshFollowups()]); };

  const actualAttendances = useMemo(() => record?.enrollments.reduce((sum, item) => sum + item.enrollment.attendances_count, 0) ?? 0, [record]);
  const pendingBalance = useMemo(() => {
    if (!record) return 0;
    const paid = new Map<string, number>();
    for (const payment of record.payments) {
      if (!payment.obligation_id || payment.status !== 'paid' || payment.voided_at) continue;
      paid.set(payment.obligation_id, (paid.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
    }
    return record.obligations
      .filter((item) => !item.cancelled_at)
      .reduce((sum, item) => sum + Math.max(0, Number(item.amount ?? 0) - (paid.get(item.id) ?? 0)), 0);
  }, [record]);

  if (!isAdmin) return <Redirect href="/home" />;

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
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing || followupLoading} onRefresh={refreshAll} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando cliente...</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void refresh()}><Text style={styles.primaryText}>Reintentar</Text></Pressable></View> : null}

      {record && !loading && !error ? (
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
            <View style={[styles.metric, styles.followupMetric]}>
              <Text style={styles.followupTitle}>Seguimiento</Text>
              {followupLoading ? (
                <Text style={styles.followupMuted}>Verificando seguimiento…</Text>
              ) : followupError ? (
                <Text accessibilityRole="alert" style={styles.followupMuted}>{followupError} Desliza para reintentar.</Text>
              ) : followups.length === 0 ? (
                <Text style={styles.followupClear}>Sin seguimiento pendiente</Text>
              ) : (
                <>
                  <Text style={styles.followupWarning}>Requiere seguimiento · {followups.length} perro{followups.length === 1 ? '' : 's'}</Text>
                  {followups.map((row) => (
                    <View key={row.dogId} style={styles.followupRow}>
                      <Text style={styles.followupDog}>{row.dogName}</Text>
                      {row.puppyNoContinuity ? (
                        <Text style={styles.followupReason}>Puppy terminado hace {row.puppyDaysSinceCompletion} días; sin inscripción posterior.</Text>
                      ) : null}
                      {row.inactive30d ? (
                        <Text style={styles.followupReason}>Última asistencia hace {row.inactivityDays} días (30 o más sin asistir).</Text>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>

          <Text style={styles.sectionTitle}>Informacion</Text>
          <View style={styles.card}>
            <MenuRow icon="person" tone="blue" title="Datos" subtitle="Nombre, contacto y perfil" section="profile" userId={userId} />
            <MenuRow icon="badge" tone="purple" title="Membresía" subtitle="Estado, vigencia, número y visitas" section="membership" userId={userId} />
            <MenuRow icon="school" tone="yellow" title="Clases" subtitle="Programas, nivel, horario y tarjeta" section="classes" userId={userId} />
            <MenuRow icon="fact-check" tone="green" title="Asistencias" subtitle="Historial real de clases" section="attendance" userId={userId} />
            <DirectMenuRow
              icon="emoji-events"
              tone="purple"
              title="Logros"
              subtitle="Reconocimientos y completados"
              onPress={() => router.push(`/admin/customer-achievements?userId=${encodeURIComponent(userId)}` as never)}
            />
            <MenuRow icon="payments" tone="red" title="Pagos" subtitle="Obligaciones, pagos y saldo" section="payments" userId={userId} last />
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, small && styles.metricValueSmall]} numberOfLines={1}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

type MenuTone = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

function menuTone(tone: MenuTone) {
  if (tone === 'blue') return { bg: ucapsaBrand.colors.blueSoft, fg: ucapsaBrand.colors.blueDark };
  if (tone === 'green') return { bg: ucapsaBrand.colors.greenSoft, fg: ucapsaBrand.colors.greenDark };
  if (tone === 'yellow') return { bg: ucapsaBrand.colors.goldPale, fg: ucapsaBrand.colors.goldDark };
  if (tone === 'purple') return { bg: ucapsaBrand.colors.purpleSoft, fg: ucapsaBrand.colors.purpleDark };
  return { bg: ucapsaBrand.colors.redSoft, fg: ucapsaBrand.colors.redDark };
}

function DirectMenuRow({ icon, tone = 'red', title, subtitle, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; tone?: MenuTone; title: string; subtitle: string; onPress: () => void }) {
  const palette = menuTone(tone);
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.iconBox, { backgroundColor: palette.bg }]}><MaterialIcons name={icon} size={21} color={palette.fg} /></View>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>
      <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

function MenuRow({ icon, tone = 'red', title, subtitle, section, userId, last = false }: { icon: keyof typeof MaterialIcons.glyphMap; tone?: MenuTone; title: string; subtitle: string; section: string; userId: string; last?: boolean }) {
  const palette = menuTone(tone);
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={() => router.push(`/admin/customer-section?userId=${encodeURIComponent(userId)}&section=${section}` as never)}>
      <View style={[styles.iconBox, { backgroundColor: palette.bg }]}><MaterialIcons name={icon} size={21} color={palette.fg} /></View>
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
  followupMetric: { width: '100%', gap: 4 },
  followupTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  followupMuted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  followupClear: { color: ucapsaBrand.colors.greenDark, fontSize: 14, fontWeight: '800' },
  followupWarning: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  followupRow: { marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border },
  followupDog: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  followupReason: { color: ucapsaBrand.colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 2 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 9 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
});
