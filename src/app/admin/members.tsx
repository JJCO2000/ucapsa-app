import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  formatDate,
  getAdminMembershipRows,
  getDisplayName,
  getMembershipStatusLabel,
  getPaymentStatusLabel,
  isMembershipDateExpired,
  type MembershipAdminRow,
} from '../../services/memberships.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type MemberFilter = 'all' | 'pending' | 'active' | 'payment' | 'expired';

export default function AdminMembersScreen() {
  const params = useLocalSearchParams<{ userId?: string; filter?: string }>();
  const [rows, setRows] = useState<MembershipAdminRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MemberFilter>(
    params.filter === 'pending_requests' ? 'pending' : params.filter === 'active' ? 'active' : 'all',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextRows = await withOperationTimeout(getAdminMembershipRows(), DEFAULT_READ_TIMEOUT_MS, 'admin-members-load');
      setRows(nextRows);
      setHasData(true);
    } catch {
      setError(friendlyReadError('No se pudieron cargar las membresias.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.membership.status === 'pending').length,
    active: rows.filter((row) => row.membership.status === 'active').length,
    payment: rows.filter((row) => row.membership.current_payment_status !== 'paid' && row.membership.current_payment_status !== 'not_required').length,
    expired: rows.filter((row) => row.membership.status === 'active' && isMembershipDateExpired(row.membership)).length,
  }), [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'pending' && row.membership.status !== 'pending') return false;
      if (filter === 'active' && row.membership.status !== 'active') return false;
      if (filter === 'payment' && (row.membership.current_payment_status === 'paid' || row.membership.current_payment_status === 'not_required')) return false;
      if (filter === 'expired' && !(row.membership.status === 'active' && isMembershipDateExpired(row.membership))) return false;
      if (!query) return true;
      const haystack = [
        getDisplayName(row.profile),
        row.profile?.email,
        row.profile?.phone,
        row.membership.member_number,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [filter, rows, search]);

  const routeUserId = typeof params.userId === 'string' ? params.userId.trim() : '';
  if (routeUserId) {
    return <MembershipRedirect userId={routeUserId} />;
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Administracion</Text>
          <Text style={styles.title}>Membresias</Text>
          <Text style={styles.subtitle}>Busca un socio y entra solo a Membresia, Pagos o su ficha.</Text>
        </View>
        <Pressable style={styles.scanButton} onPress={() => router.push('/admin/scanner?mode=member' as never)}>
          <MaterialIcons name="qr-code-scanner" size={22} color={ucapsaBrand.colors.redDark} />
        </Pressable>
      </View>

      <View style={styles.metrics}>
        <Metric label="Todas" value={stats.total} active={filter === 'all'} onPress={() => setFilter('all')} />
        <Metric label="Pendientes" value={stats.pending} active={filter === 'pending'} onPress={() => setFilter('pending')} />
        <Metric label="Activas" value={stats.active} active={filter === 'active'} onPress={() => setFilter('active')} />
        <Metric label="Pago" value={stats.payment} active={filter === 'payment'} onPress={() => setFilter('payment')} />
        <Metric label="Vencidas" value={stats.expired} active={filter === 'expired'} onPress={() => setFilter('expired')} />
      </View>

      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Nombre, correo, telefono o numero" style={styles.searchInput} />
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando membresias...</Text></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>No se pudo actualizar</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.retryButton} onPress={() => void load()}><Text style={styles.retryText}>Reintentar</Text></Pressable></View> : null}
      {!loading && hasData && visibleRows.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Sin resultados</Text><Text style={styles.muted}>Cambia el filtro o la busqueda.</Text></View> : null}

      <View style={styles.list}>
        {visibleRows.map((row, index) => (
          <MemberRow key={row.membership.id} row={row} last={index === visibleRows.length - 1} />
        ))}
      </View>
    </KeyboardAwareScreen>
  );
}

function MembershipRedirect({ userId }: { userId: string }) {
  useFocusEffect(useCallback(() => {
    router.replace(`/admin/customer-membership?userId=${encodeURIComponent(userId)}` as never);
    return undefined;
  }, [userId]));
  return <KeyboardAwareScreen><View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Abriendo membresia...</Text></View></KeyboardAwareScreen>;
}

function Metric({ label, value, active, onPress }: { label: string; value: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.metric, active && styles.metricActive]} onPress={onPress}>
      <Text style={[styles.metricValue, active && styles.metricValueActive]}>{value}</Text>
      <Text style={[styles.metricLabel, active && styles.metricLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function MemberRow({ row, last }: { row: MembershipAdminRow; last: boolean }) {
  const userId = encodeURIComponent(row.membership.user_id);
  const warning = row.profile?.deletion_requested_at ? 'Eliminacion solicitada' : null;
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Pressable style={styles.rowMain} onPress={() => router.push(`/admin/customer?userId=${userId}` as never)}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{getDisplayName(row.profile).slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{getDisplayName(row.profile)}</Text>
          <Text style={styles.rowMeta}>{row.membership.member_number || 'Numero pendiente'} - {getMembershipStatusLabel(row.membership.status)}</Text>
          <Text style={styles.rowMeta}>Pago: {getPaymentStatusLabel(row.membership.current_payment_status)} - Vigencia: {formatDate(row.membership.end_date)}</Text>
          {warning ? <Text style={styles.warning}>{warning}</Text> : null}
        </View>
        <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
      </Pressable>
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => router.push(`/admin/customer-membership?userId=${userId}` as never)}><Text style={styles.actionText}>Membresia</Text></Pressable>
        <Pressable style={styles.action} onPress={() => router.push(`/admin/customer-payments?userId=${userId}` as never)}><Text style={styles.actionText}>Pagos</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  scanButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  metric: { minWidth: 74, flexGrow: 1, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 9 },
  metricActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  metricValueActive: { color: ucapsaBrand.colors.surface },
  metricLabel: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '900', marginTop: 2 },
  metricLabelActive: { color: ucapsaBrand.colors.surface },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, minHeight: 46, color: ucapsaBrand.colors.text },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  errorBox: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14, gap: 6, marginBottom: 12 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  retryButton: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  empty: { alignItems: 'center', gap: 4, paddingVertical: 30 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted, padding: 12 },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  avatarText: { color: ucapsaBrand.colors.redDark, fontSize: 16, fontWeight: '900' },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  warning: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 7, marginTop: 9, marginLeft: 50 },
  action: { borderRadius: 11, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 11, paddingVertical: 8 },
  actionText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
});
