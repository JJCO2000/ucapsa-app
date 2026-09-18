import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getAdminMembershipRows } from '../../services/memberships.service';
import { getAdminPaymentAttentionRows } from '../../services/payments.service';
import { getAdminClientProfiles } from '../../services/profiles.service';
import { getAdminProgramRows } from '../../services/programs.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type DashboardStats = {
  clients: number;
  activePrograms: number;
  pendingRequests: number;
  paymentAttention: number;
};

const emptyStats: DashboardStats = { clients: 0, activePrograms: 0, pendingRequests: 0, paymentAttention: 0 };

export default function AdminHomeTab() {
  const { user, profile, role, isAdmin } = useSession();
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  const displayName = useMemo(() => profile?.full_name?.trim() || user?.email || 'Administrador', [profile?.full_name, user?.email]);
  const roleLabel = role === 'super_admin' ? 'Superadmin' : 'Admin';

  const load = useCallback(async () => {
    if (!isAdmin) return;

    setError(null);
    const [profiles, memberships, programs, paymentAttentionRows] = await withOperationTimeout(Promise.all([
      getAdminClientProfiles(),
      getAdminMembershipRows(),
      getAdminProgramRows(),
      getAdminPaymentAttentionRows(),
    ]), DEFAULT_READ_TIMEOUT_MS, 'admin-home-load');

    const attentionUsers = new Set(paymentAttentionRows.map((row) => row.userId));
    for (const row of memberships) {
      if (row.membership.current_payment_status === 'pending') attentionUsers.add(row.membership.user_id);
    }

    setStats({
      clients: profiles.length,
      activePrograms: programs.filter((item) => item.enrollment.status === 'active').length,
      pendingRequests: memberships.filter((item) => item.membership.status === 'pending').length,
      paymentAttention: attentionUsers.size,
    });
    setHasData(true);
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return undefined;
    setLoading(true);
    void load().catch(() => setError(friendlyReadError('No se pudo actualizar el resumen administrativo.'))).finally(() => setLoading(false));
    return undefined;
  }, [isAdmin, load]));

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch {
      setError(friendlyReadError('No se pudo actualizar el resumen administrativo.'));
    } finally {
      setRefreshing(false);
    }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{roleLabel}</Text>
        <Text style={styles.title}>Hola, {displayName.split(' ')[0]}</Text>
        <Text style={styles.subtitle}>Lo importante de hoy y las acciones que más usas, sin esconder herramientas.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Actualizando resumen...</Text></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>No se pudo actualizar</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.retryButton} onPress={() => void refresh()}><Text style={styles.retryText}>Reintentar</Text></Pressable></View> : null}

      <Text style={styles.sectionTitle}>Atención</Text>
      {hasData ? <View style={styles.metricsGrid}>
        <Metric label="Solicitudes" value={stats.pendingRequests} icon="event-note" onPress={() => router.push('/admin/members?filter=pending_requests' as never)} />
        <Metric label="Pagos pendientes" value={stats.paymentAttention} icon="payments" onPress={() => router.push('/admin-payments' as never)} />
        <Metric label="Clases activas" value={stats.activePrograms} icon="school" onPress={() => router.push('/admin-classes' as never)} />
        <Metric label="Clientes" value={stats.clients} icon="people" onPress={() => router.push('/admin-clients' as never)} />
      </View> : !loading && !error ? <Text style={styles.muted}>Aún no hay un resumen confirmado.</Text> : null}

      <Text style={styles.sectionTitle}>Seguimiento</Text>
      <View style={styles.actionCard}>
        <MenuRow icon="insights" title="Continuidad" subtitle="Evidencia de valor visible, actividad y pagos" onPress={() => router.push('/admin/continuity' as never)} last />
      </View>

      <Text style={styles.sectionTitle}>Competencia</Text>
      <View style={styles.actionCard}>
        <MenuRow icon="emoji-events" title="Competencia UCAPSA" subtitle="Temporadas, constancia, exámenes, ajustes y premios" onPress={() => router.push('/admin/competition' as never)} last />
      </View>

      <Text style={styles.sectionTitle}>Comunicación</Text>
      <View style={styles.actionCard}>
        <MenuRow icon="campaign" title="Crear anuncio" subtitle="Publica un aviso y programa recordatorios" onPress={() => router.push('/admin/announcements?intent=new' as never)} />
        <MenuRow icon="event" title="Eventos" subtitle="Crea y administra fechas importantes" onPress={() => router.push('/admin/events' as never)} />
        <MenuRow icon="notifications-active" title="Enviar notificación" subtitle="Aviso directo a usuarios" onPress={() => router.push('/admin/notifications' as never)} last />
      </View>

      <Text style={styles.sectionTitle}>Operación rápida</Text>
      <View style={styles.actionCard}>
        <MenuRow icon="person-search" title="Buscar cliente" subtitle="Abre Clientes" onPress={() => router.push('/admin-clients' as never)} />
        <MenuRow icon="fact-check" title="Registrar asistencia" subtitle="Elige cliente y abre Asistencias" onPress={() => router.push('/admin-clients?intent=attendance' as never)} />
        <MenuRow icon="payments" title="Registrar pago" subtitle="Elige cliente y abre Pagos" onPress={() => router.push('/admin-clients?intent=payments' as never)} />
        <MenuRow icon="restaurant-menu" title="Restaurante" subtitle="Menú y disponibilidad" onPress={() => router.push('/admin/restaurant' as never)} />
        <MenuRow icon="calendar-month" title="Calendario" subtitle="Agenda de eventos y clases" onPress={() => router.push('/calendar' as never)} />
        <MenuRow icon="qr-code-scanner" title="Escanear" subtitle="Credencial o asistencia" onPress={() => router.push('/admin/scanner' as never)} last />
      </View>
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value, icon, onPress }: { label: string; value: number; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void }) {
  return (
    <Pressable style={styles.metric} onPress={onPress}>
      <MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.red} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Pressable>
  );
}

function MenuRow({ icon, title, subtitle, onPress, last = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable style={[styles.menuRow, last && styles.menuRowLast]} onPress={onPress}>
      <View style={styles.menuIcon}><MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuSubtitle}>{subtitle}</Text></View>
      <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: ucapsaBrand.colors.red, borderRadius: 26, padding: 20, gap: 4, marginBottom: 20 },
  kicker: { color: ucapsaBrand.colors.redSoftStrong, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.surface, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.redSoft, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
  errorBox: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14, gap: 6, marginBottom: 14 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  retryButton: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900', marginTop: 8, marginBottom: 10 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  metric: { width: '48%', minHeight: 112, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, gap: 5 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  actionCard: { borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden', marginBottom: 18 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  menuTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  menuSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
});
