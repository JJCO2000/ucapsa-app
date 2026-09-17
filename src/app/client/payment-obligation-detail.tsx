import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview } from '../../services/payments.service';
import type { PaymentObligationWithBalance } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import { money, obligationStatusLabel, paymentDateLabel } from '../../utils/paymentPresentation';

export default function PaymentObligationDetailScreen() {
  const { obligationId: rawObligationId } = useLocalSearchParams<{ obligationId?: string | string[] }>();
  const obligationId = Array.isArray(rawObligationId) ? rawObligationId[0] ?? null : rawObligationId ?? null;
  const { user, role, isAdmin } = useSession();
  const [item, setItem] = useState<PaymentObligationWithBalance | null>(null);
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
      const overview = await withOperationTimeout(getMyPaymentOverview(), DEFAULT_READ_TIMEOUT_MS, 'payment-obligation-detail');
      if (!isCurrentRun()) return;
      const found = obligationId ? overview.obligations.find((candidate) => candidate.id === obligationId) ?? null : null;
      setItem(found);
      if (!found) setError('No encontramos este cargo abierto. Puede haberse pagado, cancelado o actualizado.');
    } catch {
      if (!isCurrentRun()) return;
      setItem(null);
      setError('Conéctate para verificar este cargo antes de pagar.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, obligationId, user]);

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
      <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>CARGO</Text>
      <Text style={[styles.title, { color: format.text }]}>Detalle</Text>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.meta, { color: format.muted }]}>Verificando cargo...</Text></View> : null}
      {error && !item ? <View style={[styles.card, premium && styles.cardPremium]}><Text style={[styles.cardTitle, premium && styles.textPremium]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.link, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Reintentar</Text></Pressable></View> : null}

      {item ? (
        <>
          <View style={[styles.card, premium && styles.cardPremium]}>
            <View style={styles.headerRow}>
              <View style={[styles.icon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft }]}><MaterialIcons name="receipt-long" size={23} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, premium && styles.textPremium]}>{item.concept}</Text>
                <Text style={[styles.meta, premium && styles.mutedPremium]}>{obligationStatusLabel(item)} · vence {paymentDateLabel(item.due_date)}</Text>
              </View>
            </View>
            <View style={styles.metrics}>
              <Metric label="TOTAL" value={money(item.amount)} premium={premium} />
              <Metric label="PAGADO" value={money(item.paid_amount)} premium={premium} />
              <Metric label="POR PAGAR" value={money(item.remaining_amount)} premium={premium} strong />
            </View>
            {item.period_start || item.period_end ? <Detail label="Periodo" value={[paymentDateLabel(item.period_start), paymentDateLabel(item.period_end)].filter((value) => value !== 'Sin fecha').join(' – ')} premium={premium} /> : null}
            {item.notes ? <Detail label="Notas" value={item.notes} premium={premium} /> : null}
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Transferir este cargo" onPress={() => router.push(`/client/payment-transfer?obligationId=${encodeURIComponent(item.id)}` as never)} style={[styles.primaryButton, { backgroundColor: format.primaryButton }]}>
            <MaterialIcons name="account-balance" size={21} color={format.primaryButtonText} />
            <Text style={[styles.primaryText, { color: format.primaryButtonText }]}>Transferir este cargo</Text>
          </Pressable>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value, premium, strong = false }: { label: string; value: string; premium: boolean; strong?: boolean }) {
  return <View style={styles.metric}><Text style={[styles.label, premium && styles.mutedPremium]}>{label}</Text><Text style={[strong ? styles.metricStrong : styles.metricValue, premium && (strong ? styles.goldText : styles.textPremium)]}>{value}</Text></View>;
}
function Detail({ label, value, premium }: { label: string; value: string; premium: boolean }) {
  return <View style={styles.detail}><Text style={[styles.label, premium && styles.mutedPremium]}>{label.toUpperCase()}</Text><Text style={[styles.detailValue, premium && styles.textPremium]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '900', marginBottom: 14 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  card: { gap: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22, padding: 16, backgroundColor: ucapsaBrand.colors.surface },
  cardPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, gap: 4 },
  label: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.6 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  metricStrong: { color: ucapsaBrand.colors.redDark, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  detail: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  primaryButton: { minHeight: 54, marginTop: 14, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  primaryText: { fontSize: 14, fontWeight: '900' },
  link: { fontSize: 12, fontWeight: '900' },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  goldText: { color: ucapsaBrand.colors.premiumActionText },
});
