import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import {
  clientReadKeys,
  createPaymentOfflineSummary,
  readClientResource,
  writeClientResource,
  type PaymentOfflineSummary,
} from '../../services/client-read-cache.service';
import { getMyPaymentOverview, getPaymentSettings, isValidClabe, normalizeClabe } from '../../services/payments.service';
import type { MyPaymentOverview, PaymentObligationWithBalance, PaymentSettings } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import { money, obligationStatusLabel, paymentDateLabel } from '../../utils/paymentPresentation';

const emptyOverview: MyPaymentOverview = {
  obligations: [],
  payments: [],
  outstanding_total: 0,
  attention_total: 0,
  future_total: 0,
  overdue_count: 0,
  legacy_membership_pending: false,
};

export default function PaymentsTab() {
  const { user, role, isAdmin } = useSession();
  const [overview, setOverview] = useState<MyPaymentOverview>(emptyOverview);
  const [bankSettings, setBankSettings] = useState<PaymentSettings | null>(null);
  const [bankUnavailable, setBankUnavailable] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [detailsAvailable, setDetailsAvailable] = useState(false);
  const [overviewAvailable, setOverviewAvailable] = useState(false);
  const cacheScopeRef = useRef<string | null>(null);
  const loadRunRef = useRef(0);

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    const scope = user?.id ?? (isAdmin ? 'admin' : 'public');

    if (cacheScopeRef.current !== scope) {
      cacheScopeRef.current = scope;
      setOverview(emptyOverview);
      setBankSettings(null);
      setBankUnavailable(false);
      setLocalReady(false);
      setUsingSavedData(false);
      setSavedAt(null);
      setDetailsAvailable(false);
      setOverviewAvailable(false);
    }

    if (!user || isAdmin) return;

    setUsingSavedData(false);
    setDetailsAvailable(false);
    // La CLABE nunca se hidrata desde caché: se borra antes de cada verificación en vivo.
    setBankSettings(null);
    setBankUnavailable(false);

    const cached = await readClientResource<PaymentOfflineSummary>(user.id, clientReadKeys.paymentSummary);
    if (!isCurrentRun()) return;

    if (cached) {
      setOverview({ ...emptyOverview, ...cached.data });
      setOverviewAvailable(true);
      setSavedAt(cached.saved_at);
    }
    setLocalReady(true);

    const [overviewResult, settingsResult] = await Promise.allSettled([
      withOperationTimeout(getMyPaymentOverview(), DEFAULT_READ_TIMEOUT_MS, 'payments-overview'),
      withOperationTimeout(getPaymentSettings(), DEFAULT_READ_TIMEOUT_MS, 'payments-bank-settings'),
    ]);
    if (!isCurrentRun()) return;

    if (overviewResult.status === 'fulfilled') {
      const fresh = overviewResult.value;
      setOverview(fresh);
      setOverviewAvailable(true);
      setDetailsAvailable(true);
      const stored = await writeClientResource(user.id, clientReadKeys.paymentSummary, createPaymentOfflineSummary(fresh));
      if (!isCurrentRun()) return;
      setSavedAt(stored.saved_at);
    } else if (cached) {
      setUsingSavedData(true);
    } else {
      setOverview(emptyOverview);
      setOverviewAvailable(false);
    }

    if (settingsResult.status === 'fulfilled') {
      const settings = settingsResult.value;
      const verified = Boolean(
        settings?.is_active &&
        isValidClabe(settings.clabe) &&
        settings.bank_name?.trim() &&
        settings.account_holder?.trim(),
      );
      setBankSettings(verified ? settings : null);
      setBankUnavailable(Boolean(settings?.is_active && !verified));
    } else {
      setBankSettings(null);
      setBankUnavailable(true);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function copyClabe() {
    const clabe = normalizeClabe(bankSettings?.clabe);
    if (!bankSettings?.is_active || !bankSettings.account_holder?.trim() || !isValidClabe(clabe)) {
      Alert.alert('CLABE no verificada', 'Conéctate para consultar la CLABE vigente antes de transferir.');
      return;
    }
    await Clipboard.setStringAsync(clabe);
    Alert.alert('CLABE copiada', 'Verifica el titular en tu aplicación bancaria antes de confirmar la transferencia.');
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-payments" />;

  const recentObligations = overview.obligations.slice(0, 3);
  const recentPayments = overview.payments.slice(0, 3);

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="payments" />

      <View style={styles.header}>
        <View style={[styles.headerIcon, premium && styles.headerIconPremium]}>
          <MaterialIcons name="account-balance-wallet" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.headerTitle, premium && styles.textPremium]}>Pagos</Text>
          <Text style={[styles.headerSubtitle, premium && styles.mutedPremium]}>Tu saldo y movimientos recientes</Text>
        </View>
      </View>

      {usingSavedData ? (
        <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando saldo guardado" />
      ) : null}

      {localReady && overviewAvailable ? (
        <>
          <View style={[styles.balanceCard, premium && styles.cardPremium]}>
            <View style={styles.balanceTopRow}>
              <View style={[styles.balanceIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : overview.outstanding_total > 0.005 ? ucapsaBrand.colors.warningSoft : ucapsaBrand.colors.successSoft }]}>
                <MaterialIcons
                  name={overview.outstanding_total > 0.005 ? 'account-balance-wallet' : 'check-circle'}
                  size={22}
                  color={premium ? ucapsaBrand.colors.premiumActionText : overview.outstanding_total > 0.005 ? ucapsaBrand.colors.warningDark : ucapsaBrand.colors.successDark}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, premium && styles.goldText]}>ESTADO DE CUENTA</Text>
                <Text style={[styles.balanceLabel, premium && styles.mutedPremium]}>{overview.outstanding_total > 0.005 ? 'Saldo abierto' : 'Sin cargos abiertos'}</Text>
              </View>
            </View>
            <Text style={[styles.balanceValue, premium && styles.textPremium]}>{overview.outstanding_total > 0.005 ? money(overview.outstanding_total) : 'Sin saldo'}</Text>
            <Text style={[styles.muted, premium && styles.mutedPremium]}>
              {overview.overdue_count > 0
                ? `${overview.overdue_count} cargo${overview.overdue_count === 1 ? '' : 's'} vencido${overview.overdue_count === 1 ? '' : 's'}.`
                : overview.future_total > 0.005
                  ? `Cargos futuros: ${money(overview.future_total)}.`
                  : overview.outstanding_total > 0.005
                    ? 'Abre un cargo para revisar su detalle y pagar.'
                    : 'No tienes cargos abiertos registrados.'}
            </Text>
          </View>

          {bankSettings ? (
            <View style={[styles.bankStrip, premium && styles.cardPremium]}>
              <View style={[styles.bankIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft }]}>
                <MaterialIcons name="account-balance" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
              </View>
              <View style={styles.bankCopy}>
                <Text style={[styles.eyebrow, premium && styles.goldText]}>CLABE UCAPSA</Text>
                <Text selectable style={[styles.bankClabe, premium && styles.textPremium]}>{normalizeClabe(bankSettings.clabe)}</Text>
                <Text numberOfLines={1} style={[styles.bankMeta, premium && styles.mutedPremium]}>{bankSettings.bank_name} · Titular: {bankSettings.account_holder?.replace(/\s+/g, ' ').trim()}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copiar CLABE UCAPSA"
                onPress={() => void copyClabe()}
                style={({ pressed }) => [styles.copyButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }, pressed && styles.pressed]}
              >
                <MaterialIcons name="content-copy" size={18} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                <Text style={[styles.copyText, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Copiar</Text>
              </Pressable>
            </View>
          ) : bankUnavailable ? (
            <View style={[styles.bankUnavailableStrip, premium && styles.cardPremium]}>
              <MaterialIcons name="cloud-off" size={18} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
              <Text style={[styles.bankUnavailableText, premium && styles.mutedPremium]}>Conéctate para consultar la CLABE vigente.</Text>
            </View>
          ) : null}

          {overview.legacy_membership_pending ? (
            <View style={[styles.notice, premium && styles.cardPremium]}>
              <MaterialIcons name="hourglass-top" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, premium && styles.textPremium]}>Comprobante en revisión</Text>
                <Text style={[styles.muted, premium && styles.mutedPremium]}>UCAPSA está revisando un pago de membresía.</Text>
              </View>
            </View>
          ) : null}

          {detailsAvailable ? (
            <>
              <SectionHeader
                title="Cargos abiertos"
                action={overview.obligations.length > 0 ? 'Ver todos' : undefined}
                onPress={() => router.push('/client/payment-obligations' as never)}
                premium={premium}
                color={format.accentDark}
              />
              {recentObligations.length === 0 ? (
                <View style={[styles.emptyCard, premium && styles.cardPremium]}>
                  <Text style={[styles.muted, premium && styles.mutedPremium]}>No tienes cargos abiertos.</Text>
                </View>
              ) : recentObligations.map((item) => (
                <ObligationRow
                  key={item.id}
                  item={item}
                  premium={premium}
                  onPress={() => router.push(`/client/payment-obligation-detail?obligationId=${encodeURIComponent(item.id)}` as never)}
                />
              ))}

              <SectionHeader
                title="Pagos recientes"
                action={overview.payments.length > 0 ? 'Ver historial' : undefined}
                onPress={() => router.push('/client/payment-history' as never)}
                premium={premium}
                color={format.accentDark}
              />
              {recentPayments.length === 0 ? (
                <View style={[styles.emptyCard, premium && styles.cardPremium]}>
                  <Text style={[styles.muted, premium && styles.mutedPremium]}>Todavía no hay pagos registrados.</Text>
                </View>
              ) : recentPayments.map((payment) => (
                <Pressable
                  key={payment.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir pago ${payment.period_label || payment.concept}`}
                  onPress={() => router.push(`/client/payment-detail?paymentId=${encodeURIComponent(payment.id)}` as never)}
                  style={({ pressed }) => [styles.row, premium && styles.cardPremium, pressed && styles.pressed]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowTitle, premium && styles.textPremium]}>{payment.period_label || payment.concept}</Text>
                    <Text style={[styles.muted, premium && styles.mutedPremium]}>{paymentDateLabel(payment.paid_at)}</Text>
                  </View>
                  <Text style={[styles.paidAmount, premium && styles.goldText]}>{money(Number(payment.amount ?? 0))}</Text>
                  <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
                </Pressable>
              ))}
            </>
          ) : (
            <View style={[styles.emptyCard, premium && styles.cardPremium]}>
              <Text style={[styles.rowTitle, premium && styles.textPremium]}>Resumen disponible sin conexión</Text>
              <Text style={[styles.muted, premium && styles.mutedPremium]}>El detalle de cargos y pagos se consulta en línea y no se guarda completo en el dispositivo.</Text>
            </View>
          )}
        </>
      ) : null}

      {localReady && !overviewAvailable ? (
        <View style={[styles.emptyCard, premium && styles.cardPremium]}>
          <MaterialIcons name="cloud-off" size={24} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
          <Text style={[styles.rowTitle, premium && styles.textPremium]}>Saldo aún no guardado</Text>
          <Text style={[styles.muted, premium && styles.mutedPremium]}>Conéctate una vez para guardar un resumen de tu saldo. No asumiremos que tu saldo es cero cuando no podamos verificarlo.</Text>
          <Pressable style={[styles.retryButton, { borderColor: format.cardBorder }]} onPress={() => void refresh()}>
            <Text style={[styles.retryText, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function SectionHeader({ title, action, onPress, premium, color }: { title: string; action?: string; onPress: () => void; premium: boolean; color: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, premium && styles.textPremium]}>{title}</Text>
      {action ? <Pressable onPress={onPress}><Text style={[styles.sectionAction, { color: premium ? ucapsaBrand.colors.premiumAction : color }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

function ObligationRow({ item, premium, onPress }: { item: PaymentObligationWithBalance; premium: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir cargo ${item.concept}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, premium && styles.cardPremium, pressed && styles.pressed]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, premium && styles.textPremium]}>{item.concept}</Text>
        <Text style={[styles.muted, premium && styles.mutedPremium]}>Vence {paymentDateLabel(item.due_date)} · {obligationStatusLabel(item)}</Text>
      </View>
      <Text style={[styles.amount, premium && styles.goldText]}>{money(item.remaining_amount)}</Text>
      <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
  headerIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surfaceAlt },
  headerIconPremium: { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  headerTitle: { color: ucapsaBrand.colors.text, fontSize: 24, lineHeight: 28, fontWeight: '900' },
  headerSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  balanceCard: { gap: 8, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22, padding: 16, backgroundColor: ucapsaBrand.colors.surface, marginBottom: 12 },
  balanceTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: ucapsaBrand.colors.redDark, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  balanceLabel: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  balanceValue: { color: ucapsaBrand.colors.text, fontSize: 30, lineHeight: 34, fontWeight: '900' },
  bankStrip: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, padding: 12, backgroundColor: ucapsaBrand.colors.surface, marginBottom: 12 },
  bankIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bankCopy: { flex: 1, minWidth: 0 },
  bankClabe: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900', letterSpacing: 0.25 },
  bankMeta: { color: ucapsaBrand.colors.muted, marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  copyButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10 },
  copyText: { fontSize: 11, fontWeight: '900' },
  bankUnavailableStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: ucapsaBrand.colors.surface, marginBottom: 12 },
  bankUnavailableText: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  notice: { flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, padding: 13, backgroundColor: ucapsaBrand.colors.surface, marginBottom: 14 },
  sectionHeader: { marginTop: 6, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  sectionAction: { fontSize: 11, fontWeight: '900' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, padding: 13, marginBottom: 8, backgroundColor: ucapsaBrand.colors.surface },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  amount: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  paidAmount: { color: ucapsaBrand.colors.success, fontSize: 14, fontWeight: '900' },
  emptyCard: { gap: 7, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, padding: 15, marginBottom: 12, backgroundColor: ucapsaBrand.colors.surface },
  retryButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { fontSize: 12, fontWeight: '900' },
  cardPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  goldText: { color: ucapsaBrand.colors.premiumActionText },
  pressed: { opacity: 0.78 },
});