import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview } from '../../services/payments.service';
import type { MyPaymentOverview } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';
import { money, paymentDateLabel } from '../../utils/paymentPresentation';

const emptyOverview: MyPaymentOverview = { obligations: [], payments: [], outstanding_total: 0, attention_total: 0, future_total: 0, overdue_count: 0, legacy_membership_pending: false };

export default function PaymentHistoryScreen() {
  const { user, role, isAdmin } = useSession();
  const [overview, setOverview] = useState<MyPaymentOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRunRef = useRef(0);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    if (!user || isAdmin) return;
    setError(null);
    try {
      const next = await withOperationTimeout(getMyPaymentOverview(), DEFAULT_READ_TIMEOUT_MS, 'payment-history');
      if (!isCurrentRun()) return;
      setOverview(next);
    } catch {
      if (!isCurrentRun()) return;
      setError(friendlyReadError('No se pudo cargar el historial de pagos.'));
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-payments" />;

  return (
    <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}>
      <Text style={[styles.kicker, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>PAGOS</Text>
      <Text style={[styles.title, { color: format.text }]}>Historial</Text>
      <Text style={[styles.subtitle, { color: format.muted }]}>Pagos que UCAPSA tiene registrados en tu cuenta.</Text>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando...</Text></View> : null}
      {error ? <View style={[styles.empty, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.rowTitle, { color: format.cardText }]}>Se necesita conexión</Text><Text style={[styles.muted, { color: format.muted }]}>El historial detallado no se guarda en el dispositivo. {error}</Text><Pressable style={[styles.retryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => void refresh()}><Text style={[styles.retryText, { color: format.secondaryButtonText }]}>Reintentar</Text></Pressable></View> : null}
      {!loading && !error && overview.payments.length === 0 ? <View style={[styles.empty, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.muted, { color: format.muted }]}>Todavía no hay pagos registrados.</Text></View> : null}

      {overview.payments.map((payment) => (
        <Pressable key={payment.id} accessibilityRole="button" accessibilityLabel={`Abrir pago ${payment.period_label || payment.concept}`} onPress={() => router.push(`/client/payment-detail?paymentId=${encodeURIComponent(payment.id)}` as never)} style={({ pressed }) => [styles.row, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }, pressed && styles.pressed]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: format.cardText }]}>{payment.period_label || payment.concept}</Text>
            <Text style={[styles.muted, { color: format.muted }]}>{paymentDateLabel(payment.paid_at)} · {payment.payment_method || 'Método no indicado'}</Text>
          </View>
          <Text style={[styles.amount, premium && styles.amountPremium]}>{money(Number(payment.amount ?? 0))}</Text>
          <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </Pressable>
      ))}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700', marginBottom: 16 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  empty: { gap: 8, borderRadius: 18, borderWidth: 1, padding: 18 },
  retryButton: { alignSelf: 'flex-start', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { fontSize: 12, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 15, marginBottom: 10 },
  rowTitle: { fontSize: 14, fontWeight: '900' },
  amount: { color: ucapsaBrand.colors.success, fontSize: 15, fontWeight: '900' },
  amountPremium: { color: ucapsaBrand.colors.gold },
  pressed: { opacity: 0.78 },
});
