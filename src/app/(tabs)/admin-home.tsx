import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { supabase } from '../../lib/supabase';
import { getAdminMembershipRows } from '../../services/memberships.service';
import { getAdminProgramRows } from '../../services/programs.service';

type DashboardStats = {
  clients: number;
  activePrograms: number;
  pendingRequests: number;
  paymentAttention: number;
};

const emptyStats: DashboardStats = { clients: 0, activePrograms: 0, pendingRequests: 0, paymentAttention: 0 };

export default function AdminHomeTab() {
  const { user, profile, isAdmin } = useSession();
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const displayName = useMemo(() => profile?.full_name?.trim() || user?.email || 'Administrador', [profile?.full_name, user?.email]);

  const load = useCallback(async () => {
    if (!isAdmin) return;

    const [profilesResult, memberships, programs, obligationsResult, paymentsResult] = await Promise.all([
      supabase.from('profiles').select('user_id, role'),
      getAdminMembershipRows(),
      getAdminProgramRows(),
      supabase.from('payment_obligations').select('id, user_id, amount, due_date, cancelled_at').is('cancelled_at', null),
      supabase.from('payments').select('obligation_id, amount, status').eq('status', 'paid').not('obligation_id', 'is', null),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (obligationsResult.error) throw obligationsResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    const paidByObligation = new Map<string, number>();
    for (const payment of paymentsResult.data ?? []) {
      if (!payment.obligation_id) continue;
      paidByObligation.set(payment.obligation_id, (paidByObligation.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
    }

    const attentionUsers = new Set<string>();
    for (const obligation of obligationsResult.data ?? []) {
      const amount = Number(obligation.amount ?? 0);
      const paid = paidByObligation.get(obligation.id) ?? 0;
      if (amount - paid > 0.005 && obligation.user_id) attentionUsers.add(obligation.user_id);
    }
    for (const row of memberships) {
      if (row.membership.current_payment_status === 'pending') attentionUsers.add(row.membership.user_id);
    }
    const paymentAttention = attentionUsers.size;

    setStats({
      clients: (profilesResult.data ?? []).filter((item) => item.role === 'client' || item.role === 'member').length,
      activePrograms: programs.filter((item) => item.enrollment.status === 'active').length,
      pendingRequests: memberships.filter((item) => item.membership.status === 'pending').length,
      paymentAttention,
    });
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return undefined;
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [isAdmin, load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>Hola, {displayName.split(' ')[0]}</Text>
        <Text style={styles.subtitle}>Lo importante de hoy, sin menus escondidos.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Actualizando resumen...</Text></View> : null}

      <Text style={styles.sectionTitle}>Atencion</Text>
      <View style={styles.metricsGrid}>
        <Metric label="Solicitudes" value={stats.pendingRequests} icon="event-note" onPress={() => router.push('/admin/members?filter=pending_requests' as never)} />
        <Metric label="Pagos pendientes" value={stats.paymentAttention} icon="payments" onPress={() => router.push('/admin-payments' as never)} />
        <Metric label="Clases activas" value={stats.activePrograms} icon="school" onPress={() => router.push('/admin-classes' as never)} />
        <Metric label="Clientes" value={stats.clients} icon="people" onPress={() => router.push('/admin-clients' as never)} />
      </View>

      <Text style={styles.sectionTitle}>Acciones rapidas</Text>
      <View style={styles.actionCard}>
        <MenuRow icon="person-search" title="Buscar cliente" subtitle="Abre Clientes" onPress={() => router.push('/admin-clients' as never)} />
        <MenuRow icon="fact-check" title="Registrar asistencia" subtitle="Elige cliente y abre Asistencias" onPress={() => router.push('/admin-clients?intent=attendance' as never)} />
        <MenuRow icon="payments" title="Registrar pago" subtitle="Elige cliente y abre Pagos" onPress={() => router.push('/admin-clients?intent=payments' as never)} />
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
  kicker: { color: '#FFDCE2', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#FFE8EC', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900', marginBottom: 10 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  metric: { width: '48%', minHeight: 112, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 14, gap: 5 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  actionCard: { borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  menuTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  menuSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
});
