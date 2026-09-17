import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview } from '../../services/payments.service';
import type { MyPaymentOverview } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import { money, obligationStatusLabel, paymentDateLabel } from '../../utils/paymentPresentation';

const emptyOverview: MyPaymentOverview = { obligations: [], payments: [], outstanding_total: 0, attention_total: 0, future_total: 0, overdue_count: 0, legacy_membership_pending: false };

export default function PaymentObligationsScreen() {
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
      const next = await withOperationTimeout(getMyPaymentOverview(), DEFAULT_READ_TIMEOUT_MS, 'payment-obligations');
      if (!isCurrentRun()) return;
      setOverview(next);
    } catch {
      if (!isCurrentRun()) return;
      setError('Conéctate para consultar el detalle de tus cargos.');
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
    <KeyboardAwareScreen style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}>
      <UcapsaAmbientBackground format={format} variant="payments" />
      <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>PAGOS</Text>
      <Text style={[styles.title, { color: format.text }]}>Cargos abiertos</Text>
      <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Elige un cargo para revisar su detalle y, si corresponde, transferir.</Text>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.subtitle, { color: format.muted }]}>Cargando cargos...</Text></View> : null}
      {error ? <View style={[styles.stateCard, premium && styles.cardPremium]}><Text style={[styles.rowTitle, premium && styles.textPremium]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.link, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Reintentar</Text></Pressable></View> : null}

      {!loading && !error ? (
        <>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryValue, premium && styles.textPremium]}>{money(overview.outstanding_total)}</Text>
            <Text style={[styles.summaryLabel, premium && styles.mutedPremium]}>saldo abierto · {overview.obligations.length} cargo{overview.obligations.length === 1 ? '' : 's'}</Text>
          </View>
          {overview.obligations.map((item) => (
            <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Abrir cargo ${item.concept}`} onPress={() => router.push(`/client/payment-obligation-detail?obligationId=${encodeURIComponent(item.id)}` as never)} style={({ pressed }) => [styles.row, premium && styles.cardPremium, pressed && styles.pressed]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rowTitle, premium && styles.textPremium]}>{item.concept}</Text>
                <Text style={[styles.meta, premium && styles.mutedPremium]}>Vence {paymentDateLabel(item.due_date)} · {obligationStatusLabel(item)}</Text>
              </View>
              <Text style={[styles.amount, premium && styles.goldText]}>{money(item.remaining_amount)}</Text>
              <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
            </Pressable>
          ))}
          {overview.obligations.length === 0 ? <View style={[styles.stateCard, premium && styles.cardPremium]}><Text style={[styles.meta, premium && styles.mutedPremium]}>No tienes cargos abiertos.</Text></View> : null}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700', marginBottom: 14 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  summaryRow: { marginBottom: 12 },
  summaryValue: { color: ucapsaBrand.colors.text, fontSize: 24, lineHeight: 28, fontWeight: '900' },
  summaryLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
  row: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, padding: 13, marginBottom: 8, backgroundColor: ucapsaBrand.colors.surface },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  amount: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  stateCard: { gap: 8, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, padding: 15, backgroundColor: ucapsaBrand.colors.surface },
  link: { fontSize: 12, fontWeight: '900' },
  cardPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  goldText: { color: ucapsaBrand.colors.premiumActionText },
  pressed: { opacity: 0.78 },
});
