import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminStatusPill } from '../../components/admin/AdminStatusPill';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getAdminPaymentAttentionRows } from '../../services/payments.service';
import { getAdminClientProfiles } from '../../services/profiles.service';
import type { Profile } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type PaymentView = 'attention' | 'overdue' | 'partial';

type CustomerBalance = {
  userId: string;
  profile: Profile | null;
  balance: number;
  overdue: boolean;
  partial: boolean;
  obligations: number;
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
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    const [attentionRows, profiles] = await withOperationTimeout(Promise.all([
      getAdminPaymentAttentionRows(),
      getAdminClientProfiles(),
    ]), DEFAULT_READ_TIMEOUT_MS, 'admin-payments-load');

    const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const byUser = new Map<string, CustomerBalance>();
    for (const row of attentionRows) {
      byUser.set(row.userId, {
        userId: row.userId,
        profile: profileByUser.get(row.userId) ?? null,
        balance: row.balance,
        overdue: row.overdue,
        partial: row.partial,
        obligations: row.obligations,
      });
    }

    setRows([...byUser.values()].sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.balance - a.balance));
    setHasData(true);
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return undefined;
    setLoading(true);
    void load().catch(() => setError(friendlyReadError('No se pudieron actualizar los pagos.'))).finally(() => setLoading(false));
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
    try { await load(); } catch { setError(friendlyReadError('No se pudieron actualizar los pagos.')); } finally { setRefreshing(false); }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>Pagos</Text>
        <Text style={styles.subtitle}>Obligaciones oficiales con saldo pendiente. El detalle se gestiona desde cada cliente.</Text>
      </View>

      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>No se pudo actualizar</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.retryButton} onPress={() => void refresh()}><Text style={styles.retryText}>Reintentar</Text></Pressable></View> : null}
      {hasData && !error ? <View style={styles.metrics}>
        <Metric label="Con saldo" value={rows.length} />
        <Metric label="Vencidos" value={rows.filter((row) => row.overdue).length} />
        <Metric label="Parciales" value={rows.filter((row) => row.partial).length} />
      </View> : null}

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

      {!loading && !error && hasData && filtered.length === 0 ? <View style={styles.empty}><MaterialIcons name="check-circle" size={34} color={ucapsaBrand.colors.success} /><Text style={styles.emptyTitle}>Sin resultados</Text><Text style={styles.muted}>No hay clientes en este filtro.</Text></View> : null}

      <View style={styles.list}>
        {!loading && !error && filtered.map((row, index) => (
          <Pressable
            key={row.userId}
            style={[styles.row, index === filtered.length - 1 && styles.rowLast]}
            onPress={() => router.push(`/admin/customer-payments?userId=${encodeURIComponent(row.userId)}` as never)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{row.profile?.full_name || row.profile?.email || 'Cliente UCAPSA'}</Text>
              <Text style={styles.meta}>`${row.obligations} obligación${row.obligations === 1 ? '' : 'es'} con saldo`</Text>
              <View style={styles.statusRow}>
                {row.overdue ? <AdminStatusPill label="Vencido" tone="danger" icon="error" /> : <AdminStatusPill label="Pendiente" tone="warning" icon="schedule" />}
                {row.partial ? <AdminStatusPill label="Parcial" tone="info" icon="pie-chart" /> : null}
              </View>
            </View>
            <View style={styles.balanceBox}><Text style={styles.balanceLabel}>Saldo</Text><Text style={styles.balance}>{money(row.balance)}</Text></View>
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

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  bankSettings: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 12 },
  bankSettingsIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  bankSettingsTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  bankSettingsText: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  metric: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.borderNeutral, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  metricValue: { color: ucapsaBrand.colors.cameraDark, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: ucapsaBrand.colors.grayDark, fontSize: 11, fontWeight: '900', marginTop: 2 },
  search: { backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: ucapsaBrand.colors.text, fontSize: 14, marginBottom: 10 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filter: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 9 },
  filterActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  filterText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  filterTextActive: { color: ucapsaBrand.colors.surface },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
  errorBox: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14, gap: 6, marginBottom: 12 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  retryButton: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 32 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  name: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.muted, fontSize: 11, marginTop: 2 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  balanceBox: { alignItems: 'flex-end' },
  balanceLabel: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '800' },
  balance: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  secondary: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 13 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
});
