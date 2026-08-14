import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { supabase } from '../../lib/supabase';
import { getAdminMembershipRows } from '../../services/memberships.service';
import type { Profile } from '../../types/app.types';

type PaymentView = 'attention' | 'overdue' | 'partial';

type ObligationRow = {
  id: string;
  user_id: string;
  concept: string;
  due_date: string;
  amount: number;
  cancelled_at: string | null;
};

type PaidRow = { obligation_id: string | null; amount: number; status: string };

type CustomerBalance = {
  userId: string;
  profile: Profile | null;
  balance: number | null;
  overdue: boolean;
  partial: boolean;
  obligations: number;
  legacyPending: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

export default function AdminPaymentsTab() {
  const { isAdmin } = useSession();
  const [rows, setRows] = useState<CustomerBalance[]>([]);
  const [view, setView] = useState<PaymentView>('attention');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    const [obligationsResult, paymentsResult, profilesResult, memberships] = await Promise.all([
      supabase.from('payment_obligations').select('id, user_id, concept, due_date, amount, cancelled_at').is('cancelled_at', null),
      supabase.from('payments').select('obligation_id, amount, status').eq('status', 'paid').not('obligation_id', 'is', null),
      supabase.from('profiles').select('*').in('role', ['client', 'member']),
      getAdminMembershipRows(),
    ]);
    if (obligationsResult.error) throw obligationsResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const obligations = (obligationsResult.data ?? []) as ObligationRow[];
    const payments = (paymentsResult.data ?? []) as PaidRow[];
    const profiles = (profilesResult.data ?? []) as Profile[];
    const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const paidByObligation = new Map<string, number>();
    for (const payment of payments) {
      if (!payment.obligation_id) continue;
      paidByObligation.set(payment.obligation_id, (paidByObligation.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
    }

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const byUser = new Map<string, CustomerBalance>();
    for (const obligation of obligations) {
      const amount = Number(obligation.amount ?? 0);
      const paid = paidByObligation.get(obligation.id) ?? 0;
      const balance = Math.max(0, amount - paid);
      if (balance <= 0.005) continue;
      const current = byUser.get(obligation.user_id) ?? {
        userId: obligation.user_id,
        profile: profileByUser.get(obligation.user_id) ?? null,
        balance: 0,
        overdue: false,
        partial: false,
        obligations: 0,
        legacyPending: false,
      };
      current.balance = (current.balance ?? 0) + balance;
      current.overdue = current.overdue || obligation.due_date < today;
      current.partial = current.partial || paid > 0.005;
      current.obligations += 1;
      byUser.set(obligation.user_id, current);
    }

    for (const membershipRow of memberships) {
      if (membershipRow.membership.current_payment_status !== 'pending') continue;
      const userId = membershipRow.membership.user_id;
      const current = byUser.get(userId);
      if (current) {
        current.legacyPending = true;
        continue;
      }
      byUser.set(userId, {
        userId,
        profile: membershipRow.profile ?? profileByUser.get(userId) ?? null,
        balance: null,
        overdue: false,
        partial: false,
        obligations: 0,
        legacyPending: true,
      });
    }

    setRows([...byUser.values()].sort((a, b) => Number(b.overdue) - Number(a.overdue) || (b.balance ?? 0) - (a.balance ?? 0)));
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return undefined;
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [isAdmin, load]));

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === 'overdue' && !row.overdue) return false;
      if (view === 'partial' && !row.partial) return false;
      if (!needle) return true;
      const profile = row.profile;
      return [profile?.full_name, profile?.email, profile?.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [rows, search, view]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>Pagos</Text>
        <Text style={styles.subtitle}>Primero lo que requiere atencion. El detalle vive dentro de cada cliente.</Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="Con saldo" value={rows.length} />
        <Metric label="Vencidos" value={rows.filter((row) => row.overdue).length} />
        <Metric label="Parciales" value={rows.filter((row) => row.partial).length} />
      </View>

      <Pressable style={styles.bankSettings} onPress={() => router.push('/admin/payment-settings' as never)}>
        <View style={styles.bankSettingsIcon}><MaterialIcons name="account-balance" size={21} color={ucapsaBrand.colors.redDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bankSettingsTitle}>Configuracion bancaria</Text>
          <Text style={styles.bankSettingsText}>Banco, titular, CLABE y referencia que ve el cliente.</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
      </Pressable>

      <TextInput value={search} onChangeText={setSearch} placeholder="Buscar cliente" style={styles.search} />
      <View style={styles.filters}>
        <Filter label="Pendientes" active={view === 'attention'} onPress={() => setView('attention')} />
        <Filter label="Vencidos" active={view === 'overdue'} onPress={() => setView('overdue')} />
        <Filter label="Parciales" active={view === 'partial'} onPress={() => setView('partial')} />
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Calculando saldos...</Text></View> : null}

      {!loading && filtered.length === 0 ? <View style={styles.empty}><MaterialIcons name="check-circle" size={34} color={ucapsaBrand.colors.success} /><Text style={styles.emptyTitle}>Sin resultados</Text><Text style={styles.muted}>No hay clientes en este filtro.</Text></View> : null}

      <View style={styles.list}>
        {filtered.map((row, index) => (
          <Pressable
            key={row.userId}
            style={[styles.row, index === filtered.length - 1 && styles.rowLast]}
            onPress={() => router.push(`/admin/customer-payments?userId=${encodeURIComponent(row.userId)}` as never)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{row.profile?.full_name || row.profile?.email || 'Cliente UCAPSA'}</Text>
              <Text style={styles.meta}>{row.obligations > 0 ? `${row.obligations} obligaciones abiertas` : 'Pago pendiente por revisar'}</Text>
              <View style={styles.statusRow}>
                {row.overdue ? <Badge label="Vencido" tone="danger" /> : <Badge label="Pendiente" tone="warning" />}
                {row.legacyPending && row.obligations === 0 ? <Badge label="Membresia" tone="info" /> : null}
                {row.partial ? <Badge label="Parcial" tone="info" /> : null}
              </View>
            </View>
            <View style={styles.balanceBox}><Text style={styles.balanceLabel}>Saldo</Text><Text style={styles.balance}>{row.balance === null ? 'Revisar' : money(row.balance)}</Text></View>
            <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.secondary} onPress={() => router.push('/admin-clients?intent=payments' as never)}>
        <MaterialIcons name="add-card" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.secondaryText}>Registrar pago para otro cliente</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Filter({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.filter, active && styles.filterActive]} onPress={onPress}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>;
}

function Badge({ label, tone }: { label: string; tone: 'danger' | 'warning' | 'info' }) {
  const style = tone === 'danger' ? styles.badgeDanger : tone === 'info' ? styles.badgeInfo : styles.badgeWarning;
  return <View style={[styles.badge, style]}><Text style={styles.badgeText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  bankSettings: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 14, marginBottom: 12 },
  bankSettingsIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  bankSettingsTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  bankSettingsText: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  metric: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 12 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: ucapsaBrand.colors.text, fontSize: 14, marginBottom: 10 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filter: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingVertical: 9 },
  filterActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  filterText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  filterTextActive: { color: '#fff' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 32 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' },
  rowLast: { borderBottomWidth: 0 },
  name: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.muted, fontSize: 11, marginTop: 2 },
  statusRow: { flexDirection: 'row', gap: 6, marginTop: 7 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  badgeDanger: { backgroundColor: '#FEE2E2' },
  badgeWarning: { backgroundColor: '#FEF3C7' },
  badgeInfo: { backgroundColor: '#DBEAFE' },
  badgeText: { color: '#3F1D24', fontSize: 10, fontWeight: '900' },
  balanceBox: { alignItems: 'flex-end' },
  balanceLabel: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '800' },
  balance: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  secondary: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', paddingVertical: 13 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
});
