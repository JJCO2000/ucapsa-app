import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview } from '../../services/payments.service';
import type { Payment } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import { money, paymentDateLabel } from '../../utils/paymentPresentation';

export default function PaymentDetailScreen() {
  const { paymentId: rawPaymentId } = useLocalSearchParams<{ paymentId?: string | string[] }>();
  const paymentId = Array.isArray(rawPaymentId) ? rawPaymentId[0] ?? null : rawPaymentId ?? null;
  const { user, role, isAdmin } = useSession();
  const [payment, setPayment] = useState<Payment | null>(null);
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
      const overview = await withOperationTimeout(getMyPaymentOverview(), DEFAULT_READ_TIMEOUT_MS, 'payment-detail');
      if (!isCurrentRun()) return;
      const found = paymentId ? overview.payments.find((item) => item.id === paymentId) ?? null : null;
      setPayment(found);
      if (!found) setError('No encontramos este pago en tu historial actual.');
    } catch {
      if (!isCurrentRun()) return;
      setPayment(null);
      setError('Conéctate para consultar el detalle de este pago.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, paymentId, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-payments" />;

  return (
    <KeyboardAwareScreen style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}>
      <UcapsaAmbientBackground format={format} variant="payments" />
      <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>PAGO REGISTRADO</Text>
      <Text style={[styles.title, { color: format.text }]}>Detalle</Text>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.meta, { color: format.muted }]}>Cargando pago...</Text></View> : null}
      {error && !payment ? <View style={[styles.card, premium && styles.cardPremium]}><Text style={[styles.cardTitle, premium && styles.textPremium]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.link, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Reintentar</Text></Pressable></View> : null}

      {payment ? (
        <View style={[styles.card, premium && styles.cardPremium]}>
          <View style={styles.headerRow}>
            <View style={[styles.icon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft }]}><MaterialIcons name="check-circle" size={24} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.successDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, premium && styles.textPremium]}>{payment.period_label || payment.concept}</Text>
              <Text style={[styles.meta, premium && styles.mutedPremium]}>{paymentDateLabel(payment.paid_at)}</Text>
            </View>
          </View>
          <Text style={[styles.amount, premium && styles.goldText]}>{money(Number(payment.amount ?? 0))}</Text>
          <Detail label="Concepto" value={payment.concept} premium={premium} />
          <Detail label="Método" value={payment.payment_method || 'No indicado'} premium={premium} />
          {payment.notes ? <Detail label="Notas" value={payment.notes} premium={premium} /> : null}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Detail({ label, value, premium }: { label: string; value: string; premium: boolean }) {
  return <View style={styles.detail}><Text style={[styles.label, premium && styles.mutedPremium]}>{label.toUpperCase()}</Text><Text style={[styles.detailValue, premium && styles.textPremium]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '900', marginBottom: 14 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  card: { gap: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22, padding: 16, backgroundColor: ucapsaBrand.colors.surface },
  cardPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  amount: { color: ucapsaBrand.colors.success, fontSize: 30, lineHeight: 34, fontWeight: '900' },
  detail: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border },
  label: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.7 },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  link: { fontSize: 12, fontWeight: '900' },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  goldText: { color: ucapsaBrand.colors.premiumActionText },
});
