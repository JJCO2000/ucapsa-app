import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
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
  const { user, role, isAdmin } = useSession();
  const [overview, setOverview] = useState<MyPaymentOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    try { setOverview(await getMyPaymentOverview()); } finally { setLoading(false); }
  }, [isAdmin, user]);
  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-payments" />;

  return (
    <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}>
      <Text style={[styles.kicker, { color: premium ? '#FFE8B5' : format.accentDark }]}>Pagos</Text>
      <Text style={[styles.title, { color: format.text }]}>Historial</Text>
      <Text style={[styles.subtitle, { color: format.muted }]}>Pagos que UCAPSA tiene registrados en tu cuenta.</Text>
      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando...</Text></View> : null}
      {!loading && overview.payments.length === 0 ? <View style={[styles.empty, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.muted, { color: format.muted }]}>Todavia no hay pagos registrados.</Text></View> : null}
      {overview.payments.map((payment) => (
        <View key={payment.id} style={[styles.row, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: format.cardText }]}>{payment.period_label || payment.concept}</Text>
            <Text style={[styles.muted, { color: format.muted }]}>{dateLabel(payment.paid_at)} - {payment.payment_method || 'Metodo no indicado'}</Text>
            {payment.notes ? <Text style={[styles.note, { color: format.cardText }]}>{payment.notes}</Text> : null}
          </View>
          <Text style={[styles.amount, premium && styles.amountPremium]}>{money(Number(payment.amount ?? 0))}</Text>
        </View>
      ))}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: '#270711' },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700', marginBottom: 16 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  empty: { borderRadius: 18, borderWidth: 1, padding: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 15, marginBottom: 10 },
  rowTitle: { fontSize: 14, fontWeight: '900' },
  note: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  amount: { color: ucapsaBrand.colors.success, fontSize: 15, fontWeight: '900' },
  amountPremium: { color: '#FACC15' },
});
