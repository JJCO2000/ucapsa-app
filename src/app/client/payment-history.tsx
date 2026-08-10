import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview } from '../../services/payments.service';
import type { MyPaymentOverview } from '../../types/app.types';

const emptyOverview: MyPaymentOverview = { obligations: [], payments: [], outstanding_total: 0, attention_total: 0, future_total: 0, overdue_count: 0, legacy_membership_pending: false };
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function money(value: number) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value); }
function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

export default function PaymentHistoryScreen() {
  const { user, isAdmin } = useSession();
  const [overview, setOverview] = useState<MyPaymentOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    try { setOverview(await getMyPaymentOverview()); } finally { setLoading(false); }
  }, [isAdmin, user]);
  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-payments" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <Text style={styles.kicker}>Pagos</Text>
      <Text style={styles.title}>Historial</Text>
      <Text style={styles.subtitle}>Pagos que UCAPSA tiene registrados en tu cuenta.</Text>
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}
      {!loading && overview.payments.length === 0 ? <View style={styles.empty}><Text style={styles.muted}>Todavia no hay pagos registrados.</Text></View> : null}
      {overview.payments.map((payment) => (
        <View key={payment.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{payment.period_label || payment.concept}</Text>
            <Text style={styles.muted}>{dateLabel(payment.paid_at)} - {payment.payment_method || 'Metodo no indicado'}</Text>
            {payment.notes ? <Text style={styles.note}>{payment.notes}</Text> : null}
          </View>
          <Text style={styles.amount}>{money(Number(payment.amount ?? 0))}</Text>
        </View>
      ))}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginBottom: 16 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  empty: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 15, marginBottom: 10 },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  note: { color: ucapsaBrand.colors.text, fontSize: 12, lineHeight: 18, marginTop: 4 },
  amount: { color: ucapsaBrand.colors.success, fontSize: 15, fontWeight: '900' },
});
