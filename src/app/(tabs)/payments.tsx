import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview, getPaymentSettings } from '../../services/payments.service';
import { clientReadKeys, createPaymentOfflineSummary, readClientResource, writeClientResource, type PaymentOfflineSummary } from '../../services/client-read-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';
import type { MyPaymentOverview, PaymentObligationWithBalance, PaymentSettings } from '../../types/app.types';

const emptyOverview: MyPaymentOverview = { obligations: [], payments: [], outstanding_total: 0, attention_total: 0, future_total: 0, overdue_count: 0, legacy_membership_pending: false };
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const whatsappUrl = ucapsaBrand.socialLinks.find((item) => item.key === 'whatsapp')?.url ?? 'https://wa.me/525522410679';

function money(value: number) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value); }
function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}
function obligationStatusLabel(item: PaymentObligationWithBalance) {
  if (item.display_status === 'paid') return 'Pagado';
  if (item.display_status === 'partial') return 'Parcial';
  if (item.display_status === 'overdue') return 'Vencido';
  if (item.display_status === 'future') return 'Futuro';
  return 'Pendiente';
}

export default function PaymentsTab() {
  const { user, role, isAdmin } = useSession();
  const [overview, setOverview] = useState<MyPaymentOverview>(emptyOverview);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [detailsAvailable, setDetailsAvailable] = useState(true);
  const [bankLoadFailed, setBankLoadFailed] = useState(false);
  const [bankChecking, setBankChecking] = useState(false);
  const [overviewAvailable, setOverviewAvailable] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    setUsingSavedData(false);
    setBankLoadFailed(false);
    setBankChecking(true);
    setOverviewAvailable(false);
    // Los datos bancarios deben verificarse en vivo antes de transferir. No conserves
    // una CLABE anterior como si siguiera vigente cuando la red falla.
    setSettings(null);

    const summaryCache = await readClientResource<PaymentOfflineSummary>(user.id, clientReadKeys.paymentSummary);

    if (summaryCache) {
      setOverview({ ...emptyOverview, ...summaryCache.data });
      setOverviewAvailable(true);
      setDetailsAvailable(false);
      setSavedAt(summaryCache.saved_at);
      setLoading(false);
    }

    const [overviewResult, settingsResult] = await Promise.allSettled([
      withOperationTimeout(getMyPaymentOverview(), DEFAULT_READ_TIMEOUT_MS, 'payments-overview'),
      withOperationTimeout(getPaymentSettings(), DEFAULT_READ_TIMEOUT_MS, 'payment-settings'),
    ]);

    if (overviewResult.status === 'fulfilled') {
      setOverview(overviewResult.value);
      setOverviewAvailable(true);
      setDetailsAvailable(true);
      const stored = await writeClientResource(user.id, clientReadKeys.paymentSummary, createPaymentOfflineSummary(overviewResult.value));
      setSavedAt(stored.saved_at);
    } else if (!summaryCache) {
      setDetailsAvailable(false);
      setOverviewAvailable(false);
    }

    if (settingsResult.status === 'fulfilled') {
      setSettings(settingsResult.value);
      setBankLoadFailed(false);
    } else {
      setSettings(null);
      setBankLoadFailed(true);
    }
    setBankChecking(false);

    if (overviewResult.status === 'rejected' && !summaryCache && settingsResult.status === 'rejected') {
      setError(friendlyReadError('No se pudieron cargar tus pagos.'));
    }

    const usedCachedData = overviewResult.status === 'rejected' && Boolean(summaryCache);
    setUsingSavedData(usedCachedData);
    if (usedCachedData && summaryCache) setSavedAt(summaryCache.saved_at);

    setLoading(false);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  async function copyValue(label: string, value: string) {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    Alert.alert(`${label} copiado`, label === 'CLABE'
      ? 'Ya puedes pegarla en tu aplicacion bancaria. Favor de mandar el comprobante por WhatsApp despues de transferir.'
      : 'Ya puedes pegar este dato donde lo necesites.');
  }

  async function openWhatsApp() {
    try { await Linking.openURL(whatsappUrl); }
    catch { Alert.alert('No se pudo abrir WhatsApp', 'Usa el canal de contacto de UCAPSA para enviar tu comprobante.'); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-payments" />;

  const recentPayments = overview.payments.slice(0, 3);
  const recentObligations = overview.obligations.slice(0, 3);
  const bankReady = Boolean(settings?.is_active && settings.clabe && settings.bank_name && settings.account_holder);

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="payments" />
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Mi UCAPSA</Text>
        <Text style={[styles.title, { color: format.text }]}>Pagos</Text>
        <Text style={[styles.subtitle, { color: format.muted }]}>Consulta saldos, transferencias y pagos registrados.</Text>
      </View>

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} /> : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando pagos...</Text></View> : null}
      {error ? <View style={[styles.errorBox, premium && styles.errorBoxPremium]}><Text style={[styles.errorTitle, premium && styles.errorTitlePremium]}>No se pudieron cargar</Text><Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{error}</Text><Pressable style={[styles.secondaryButton, premium && styles.secondaryButtonPremium]} onPress={() => void refresh()}><Text style={[styles.secondaryButtonText, premium && styles.secondaryButtonTextPremium]}>Reintentar</Text></Pressable></View> : null}

      {!loading && !error ? (
        <>
          {overviewAvailable ? <View style={[styles.balanceCard, premium && styles.balanceCardPremium, (overview.attention_total > 0.005 || overview.legacy_membership_pending) && (premium ? styles.balanceCardPremiumPending : styles.balanceCardPending)]}>
            <Text style={[styles.balanceLabel, premium && styles.mutedPremium]}>Por pagar</Text>
            <Text style={[styles.balanceValue, premium && styles.textPremium]}>{overview.outstanding_total > 0.005 ? money(overview.outstanding_total) : 'Sin saldo'}</Text>
            <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
              {overview.overdue_count > 0
                ? `${overview.overdue_count} cargo${overview.overdue_count === 1 ? '' : 's'} vencido${overview.overdue_count === 1 ? '' : 's'}.`
                : overview.legacy_membership_pending
                  ? 'Hay un pago de membresia pendiente de revision.'
                  : overview.attention_total > 0.005
                    ? 'Tienes cargos que requieren atencion.'
                    : overview.future_total > 0.005
                      ? `Cargos futuros: ${money(overview.future_total)}.`
                      : 'No tienes cargos abiertos registrados.'}
            </Text>
          </View> : (
            <View style={[styles.section, premium && styles.sectionPremium]}>
              <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Saldo no disponible</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>No pudimos consultar tu saldo. Reintenta antes de asumir que no tienes cargos pendientes.</Text>
            </View>
          )}

          {detailsAvailable && recentObligations.length > 0 ? (
            <View style={[styles.section, premium && styles.sectionPremium]}>
              <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, premium && styles.textPremium]}>Cargos abiertos</Text><Text style={[styles.count, premium && styles.countPremium]}>{overview.obligations.length}</Text></View>
              {recentObligations.map((item) => (
                <View key={item.id} style={[styles.row, premium && styles.rowPremium]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, premium && styles.textPremium]}>{item.concept}</Text>
                    <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Vence: {dateLabel(item.due_date)} - {obligationStatusLabel(item)}</Text>
                  </View>
                  <Text style={[styles.amount, premium && styles.amountPremium]}>{money(item.remaining_amount)}</Text>
                </View>
              ))}
              {overview.obligations.length > 3 ? <Text style={[styles.hint, premium && styles.mutedPremium]}>El historial completo esta en la vista de historial.</Text> : null}
            </View>
          ) : null}

          <View style={[styles.section, premium && styles.sectionPremium]}>
            <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Transferencia bancaria</Text>
            {bankReady ? (
              <>
                <BankRow label="Banco" value={settings?.bank_name ?? ''} premium={premium} />
                <BankRow label="Titular" value={settings?.account_holder ?? ''} premium={premium} copy onCopy={() => void copyValue('Titular', settings?.account_holder ?? '')} />
                <BankRow label="CLABE" value={settings?.clabe ?? ''} premium={premium} selectable copy onCopy={() => void copyValue('CLABE', settings?.clabe ?? '')} />
                {settings?.transfer_instructions ? <BankRow label="Concepto / referencia" value={settings.transfer_instructions} premium={premium} /> : null}

                <View style={[styles.receiptBox, premium && styles.receiptBoxPremium]}>
                  <MaterialIcons name="chat" size={20} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.receiptTitle, premium && styles.textPremium]}>Despues de transferir</Text>
                    <Text style={[styles.receiptText, premium && styles.mutedPremium]}>Favor de mandar el comprobante por WhatsApp para que UCAPSA pueda identificar y registrar el pago.</Text>
                  </View>
                </View>
                <Pressable style={[styles.copyButton, { backgroundColor: format.primaryButton }]} onPress={() => void copyValue('CLABE', settings?.clabe ?? '')}>
                  <MaterialIcons name="content-copy" size={19} color={format.primaryButtonText} />
                  <Text style={[styles.copyButtonText, { color: format.primaryButtonText }]}>Copiar CLABE</Text>
                </Pressable>
                <Pressable style={[styles.whatsappButton, premium && styles.whatsappButtonPremium]} onPress={() => void openWhatsApp()}>
                  <MaterialIcons name="chat" size={19} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
                  <Text style={[styles.whatsappButtonText, premium && styles.whatsappButtonTextPremium]}>Enviar comprobante por WhatsApp</Text>
                </Pressable>
                {settings?.clip_url ? (
                  <Pressable
                    style={[styles.secondaryButton, premium && styles.secondaryButtonPremium]}
                    onPress={() => void Linking.openURL(settings.clip_url as string).catch(() => Alert.alert('No se pudo abrir', 'Revisa el enlace de pago con UCAPSA.'))}
                  >
                    <Text style={[styles.secondaryButtonText, premium && styles.secondaryButtonTextPremium]}>Abrir enlace de pago</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                {bankChecking
                  ? 'Verificando los datos bancarios antes de mostrar una cuenta para transferir.'
                  : bankLoadFailed
                    ? 'No pudimos verificar los datos bancarios. Conectate y reintenta antes de transferir.'
                    : 'Los datos bancarios todavia no estan disponibles. Consulta con UCAPSA antes de transferir.'}
              </Text>
            )}
          </View>

          {!detailsAvailable ? (
            <View style={[styles.section, premium && styles.sectionPremium]}>
              <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Detalle protegido</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>El historial y el detalle de cargos requieren conexion para evitar guardar transacciones completas en el dispositivo.</Text>
            </View>
          ) : null}

          {detailsAvailable ? <View style={[styles.section, premium && styles.sectionPremium]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Pagos recientes</Text>
              {overview.payments.length > 0 ? <Pressable onPress={() => router.push('/client/payment-history' as never)}><Text style={[styles.link, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Ver historial</Text></Pressable> : null}
            </View>
            {recentPayments.length === 0 ? <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Todavia no hay pagos registrados.</Text> : recentPayments.map((payment) => (
              <View key={payment.id} style={[styles.row, premium && styles.rowPremium]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, premium && styles.textPremium]}>{payment.period_label || payment.concept}</Text>
                  <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{dateLabel(payment.paid_at)}</Text>
                </View>
                <Text style={[styles.paidAmount, premium && styles.paidAmountPremium]}>{money(Number(payment.amount ?? 0))}</Text>
              </View>
            ))}
          </View> : null}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function BankRow({ label, value, selectable = false, copy = false, onCopy, premium }: { label: string; value: string; selectable?: boolean; copy?: boolean; onCopy?: () => void; premium: boolean }) {
  return (
    <View style={[styles.bankRow, premium && styles.rowPremium]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bankLabel, premium && styles.mutedPremium]}>{label}</Text>
        <Text selectable={selectable} style={[styles.bankValue, premium && styles.textPremium]}>{value}</Text>
      </View>
      {copy ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Copiar ${label}`} style={[styles.smallCopy, premium && styles.smallCopyPremium]} onPress={onCopy}>
          <MaterialIcons name="content-copy" size={18} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  header: { gap: 4, marginBottom: 14 },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { fontSize: 30, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  textPremium: { color: ucapsaBrand.colors.surface },
  errorBox: { gap: 5, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 16 },
  errorBoxPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.35), backgroundColor: ucapsaBrand.colors.premiumSurface },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 17, fontWeight: '900' },
  errorTitlePremium: { color: ucapsaBrand.colors.premiumAction },
  balanceCard: { gap: 5, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, backgroundColor: ucapsaBrand.colors.successSoft, padding: 18, marginBottom: 14 },
  balanceCardPending: { borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft },
  balanceCardPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.38), backgroundColor: ucapsaBrand.colors.premiumHero },
  balanceCardPremiumPending: { borderColor: ucapsaBrand.colors.gold, backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  balanceLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  balanceValue: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  section: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 14 },
  sectionPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34), backgroundColor: ucapsaBrand.colors.premiumSurface },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  count: { minWidth: 28, textAlign: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', paddingVertical: 5 },
  countPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.16), color: ucapsaBrand.colors.premiumAction },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.premiumMuted, paddingTop: 10 },
  rowPremium: { borderTopColor: withAlpha(ucapsaBrand.colors.gold, 0.16) },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  amount: { color: ucapsaBrand.colors.warning, fontSize: 14, fontWeight: '900' },
  amountPremium: { color: ucapsaBrand.colors.premiumAction },
  paidAmount: { color: ucapsaBrand.colors.success, fontSize: 14, fontWeight: '900' },
  paidAmountPremium: { color: ucapsaBrand.colors.gold },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700' },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.premiumMuted, paddingTop: 10 },
  bankLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  bankValue: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 2 },
  smallCopy: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  smallCopyPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.14), borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.25) },
  receiptBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12, marginTop: 2 },
  receiptBoxPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.28), backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.08) },
  receiptTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  receiptText: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 2 },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 12, marginTop: 2 },
  copyButtonText: { fontSize: 13, fontWeight: '900' },
  whatsappButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 12 },
  whatsappButtonPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34), backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.06) },
  whatsappButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  whatsappButtonTextPremium: { color: ucapsaBrand.colors.premiumAction },
  secondaryButton: { alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingVertical: 12 },
  secondaryButtonPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34), backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.06) },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  secondaryButtonTextPremium: { color: ucapsaBrand.colors.premiumAction },
  link: { fontSize: 13, fontWeight: '900' },
});
