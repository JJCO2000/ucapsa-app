import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview, getPaymentSettings } from '../../services/payments.service';
import { clientReadKeys, createPaymentOfflineSummary, readClientResource, writeClientResource, type PaymentOfflineSummary } from '../../services/client-read-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
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
  const [localReady, setLocalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [detailsAvailable, setDetailsAvailable] = useState(false);
  const [bankLoadFailed, setBankLoadFailed] = useState(false);
  const [bankChecking, setBankChecking] = useState(false);
  const [overviewAvailable, setOverviewAvailable] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setUsingSavedData(false);
    setBankLoadFailed(false);
    setBankChecking(true);
    setOverviewAvailable(false);
    setDetailsAvailable(false);
    // Los datos bancarios deben verificarse en vivo antes de transferir. No conserves
    // una CLABE anterior como si siguiera vigente cuando la red falla.
    setSettings(null);

    const summaryCache = await readClientResource<PaymentOfflineSummary>(user.id, clientReadKeys.paymentSummary);

    if (summaryCache) {
      setOverview({ ...emptyOverview, ...summaryCache.data });
      setOverviewAvailable(true);
      setSavedAt(summaryCache.saved_at);
    }
    setLocalReady(true);

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
      setOverview(emptyOverview);
      setOverviewAvailable(false);
      setDetailsAvailable(false);
    }

    if (settingsResult.status === 'fulfilled') {
      setSettings(settingsResult.value);
      setBankLoadFailed(false);
    } else {
      setSettings(null);
      setBankLoadFailed(true);
    }
    setBankChecking(false);

    const usedCachedData = overviewResult.status === 'rejected' && Boolean(summaryCache);
    setUsingSavedData(usedCachedData);
    if (usedCachedData && summaryCache) setSavedAt(summaryCache.saved_at);
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  async function copyValue(label: string, value: string) {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    Alert.alert(`${label} copiado`, label === 'CLABE'
      ? 'Ya puedes pegarla en tu aplicación bancaria. Envía el comprobante por WhatsApp después de transferir.'
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
      <ClientPageHeader
        format={format}
        eyebrow="Tu cuenta"
        title="Pagos"
        subtitle="Saldo, cargos, transferencias y comprobantes en un solo lugar."
        icon="account-balance-wallet"
      />

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando saldo guardado" /> : null}

      {localReady ? (
        <>
          {overviewAvailable ? (
            <>
              <View style={[styles.balanceCard, premium && styles.balanceCardPremium]}>
                <View style={styles.balanceTopRow}>
                  <View style={[styles.balanceIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : overview.outstanding_total > 0.005 ? ucapsaBrand.colors.warningSoft : ucapsaBrand.colors.successSoft }]}>
                    <MaterialIcons name={overview.outstanding_total > 0.005 ? 'account-balance-wallet' : 'check-circle'} size={22} color={premium ? ucapsaBrand.colors.premiumActionText : overview.outstanding_total > 0.005 ? ucapsaBrand.colors.warningDark : ucapsaBrand.colors.successDark} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.balanceStatus, premium && styles.balanceStatusPremium]}>ESTADO DE CUENTA</Text>
                    <Text style={[styles.balanceLabel, premium && styles.mutedPremium]}>{overview.outstanding_total > 0.005 ? 'Saldo abierto' : 'Sin cargos abiertos'}</Text>
                  </View>
                </View>
                <Text style={[styles.balanceValue, premium && styles.textPremium]}>{overview.outstanding_total > 0.005 ? money(overview.outstanding_total) : 'Sin saldo'}</Text>
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                  {overview.overdue_count > 0
                    ? `${overview.overdue_count} cargo${overview.overdue_count === 1 ? '' : 's'} vencido${overview.overdue_count === 1 ? '' : 's'}.`
                    : overview.future_total > 0.005
                      ? `Cargos futuros: ${money(overview.future_total)}.`
                      : overview.outstanding_total > 0.005
                        ? 'Consulta el detalle de tus cargos abiertos.'
                        : 'No tienes cargos abiertos registrados.'}
                </Text>
              </View>

              {overview.legacy_membership_pending ? (
                <View style={[styles.reviewNote, { borderColor: premium ? ucapsaBrand.colors.premiumBorder : ucapsaBrand.colors.warningBorder, backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : ucapsaBrand.colors.warningSoft }]}>
                  <MaterialIcons name="hourglass-top" size={20} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.warningDark} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.reviewNoteTitle, { color: premium ? ucapsaBrand.colors.premiumText : ucapsaBrand.colors.text }]}>Comprobante en revisión</Text>
                    <Text style={[styles.reviewNoteText, { color: premium ? ucapsaBrand.colors.premiumMuted : ucapsaBrand.colors.muted }]}>UCAPSA está revisando un pago de membresía.</Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : (
            <View style={[styles.section, premium && styles.sectionPremium]}>
              <MaterialIcons name="cloud-off" size={24} color={premium ? ucapsaBrand.colors.premiumActionText : format.accentDark} />
              <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Saldo aún no guardado</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Conéctate una vez para guardar un resumen de tu saldo en este dispositivo. No asumiremos que tu saldo es cero cuando no podamos verificarlo.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Reintentar sincronización de pagos" style={[styles.secondaryButton, premium && styles.secondaryButtonPremium]} onPress={() => void refresh()}>
                <Text style={[styles.secondaryButtonText, premium && styles.secondaryButtonTextPremium]}>Reintentar</Text>
              </Pressable>
            </View>
          )}

          {detailsAvailable && recentObligations.length > 0 ? (
            <View style={[styles.section, premium && styles.sectionPremium]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Cargos abiertos</Text>
                <Text style={[styles.count, premium && styles.countPremium]}>{overview.obligations.length}</Text>
              </View>
              {recentObligations.map((item) => (
                <View key={item.id} style={[styles.row, premium && styles.rowPremium]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowTitle, premium && styles.textPremium]}>{item.concept}</Text>
                    <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Vence: {dateLabel(item.due_date)} - {obligationStatusLabel(item)}</Text>
                  </View>
                  <Text style={[styles.amount, premium && styles.amountPremium]}>{money(item.remaining_amount)}</Text>
                </View>
              ))}
              {overview.obligations.length > 3 ? <Text style={[styles.hint, premium && styles.mutedPremium]}>El historial completo está en la vista de historial.</Text> : null}
            </View>
          ) : null}

          <View style={[styles.section, premium && styles.sectionPremium]}>
            <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Transferencia bancaria</Text>
            {bankReady ? (
              <>
                {!overviewAvailable ? (
                  <View style={[styles.bankWarning, { borderColor: premium ? ucapsaBrand.colors.premiumBorder : ucapsaBrand.colors.warningBorder, backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : ucapsaBrand.colors.warningSoft }]}>
                    <MaterialIcons name="warning-amber" size={20} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.warningDark} />
                    <Text style={[styles.bankWarningText, { color: premium ? ucapsaBrand.colors.premiumText : ucapsaBrand.colors.warningDark }]}>La cuenta bancaria está verificada, pero tu saldo no. Confirma el monto antes de transferir.</Text>
                  </View>
                ) : null}
                <BankRow label="Banco" value={settings?.bank_name ?? ''} premium={premium} />
                <BankRow label="Titular" value={settings?.account_holder ?? ''} premium={premium} copy onCopy={() => void copyValue('Titular', settings?.account_holder ?? '')} />
                <BankRow label="CLABE" value={settings?.clabe ?? ''} premium={premium} selectable copy onCopy={() => void copyValue('CLABE', settings?.clabe ?? '')} />
                {settings?.transfer_instructions ? <BankRow label="Concepto / referencia" value={settings.transfer_instructions} premium={premium} /> : null}

                <View style={[styles.receiptBox, premium && styles.receiptBoxPremium]}>
                  <MaterialIcons name="chat" size={20} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.redDark} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.receiptTitle, premium && styles.textPremium]}>Después de transferir</Text>
                    <Text style={[styles.receiptText, premium && styles.mutedPremium]}>Envía el comprobante por WhatsApp para que UCAPSA pueda identificar y registrar el pago.</Text>
                  </View>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Copiar CLABE" style={[styles.copyButton, { backgroundColor: format.primaryButton }]} onPress={() => void copyValue('CLABE', settings?.clabe ?? '')}>
                  <MaterialIcons name="content-copy" size={20} color={format.primaryButtonText} />
                  <Text style={[styles.copyButtonText, { color: format.primaryButtonText }]}>Copiar CLABE</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Enviar comprobante por WhatsApp" style={[styles.whatsappButton, premium && styles.whatsappButtonPremium]} onPress={() => void openWhatsApp()}>
                  <MaterialIcons name="chat" size={20} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.redDark} />
                  <Text style={[styles.whatsappButtonText, premium && styles.whatsappButtonTextPremium]}>Enviar comprobante por WhatsApp</Text>
                </Pressable>
                {settings?.clip_url ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Abrir enlace de pago"
                    style={[styles.secondaryButton, premium && styles.secondaryButtonPremium]}
                    onPress={() => void Linking.openURL(settings.clip_url as string).catch(() => Alert.alert('No se pudo abrir', 'Revisa el enlace de pago con UCAPSA.'))}
                  >
                    <Text style={[styles.secondaryButtonText, premium && styles.secondaryButtonTextPremium]}>Abrir enlace de pago</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <View style={styles.bankUnavailableRow}>
                <MaterialIcons name={bankChecking ? 'sync' : 'lock-outline'} size={20} color={premium ? ucapsaBrand.colors.premiumActionText : format.accentDark} />
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                  {bankChecking
                    ? 'Verificando los datos bancarios antes de mostrar una cuenta para transferir.'
                    : bankLoadFailed
                      ? 'No pudimos verificar los datos bancarios. Conéctate y reintenta antes de transferir.'
                      : 'Los datos bancarios todavía no están disponibles. Consulta con UCAPSA antes de transferir.'}
                </Text>
              </View>
            )}
          </View>

          {!detailsAvailable && overviewAvailable ? (
            <View style={[styles.section, premium && styles.sectionPremium]}>
              <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Resumen disponible sin conexión</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Tu saldo resumido está guardado. El historial completo de transacciones se consulta en línea para no conservar movimientos financieros detallados en almacenamiento local sin cifrar.</Text>
            </View>
          ) : null}

          {detailsAvailable ? (
            <View style={[styles.section, premium && styles.sectionPremium]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, premium && styles.textPremium]}>Pagos recientes</Text>
                {overview.payments.length > 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Ver historial de pagos" onPress={() => router.push('/client/payment-history' as never)}>
                    <Text style={[styles.link, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Ver historial</Text>
                  </Pressable>
                ) : null}
              </View>
              {recentPayments.length === 0 ? <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Todavía no hay pagos registrados.</Text> : recentPayments.map((payment) => (
                <View key={payment.id} style={[styles.row, premium && styles.rowPremium]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowTitle, premium && styles.textPremium]}>{payment.period_label || payment.concept}</Text>
                    <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{dateLabel(payment.paid_at)}</Text>
                  </View>
                  <Text style={[styles.paidAmount, premium && styles.paidAmountPremium]}>{money(Number(payment.amount ?? 0))}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function BankRow({ label, value, selectable = false, copy = false, onCopy, premium }: { label: string; value: string; selectable?: boolean; copy?: boolean; onCopy?: () => void; premium: boolean }) {
  return (
    <View style={[styles.bankRow, premium && styles.rowPremium]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.bankLabel, premium && styles.mutedPremium]}>{label}</Text>
        <Text selectable={selectable} style={[styles.bankValue, premium && styles.textPremium]}>{value}</Text>
      </View>
      {copy ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Copiar ${label}`} style={[styles.smallCopy, premium && styles.smallCopyPremium]} onPress={onCopy}>
          <MaterialIcons name="content-copy" size={19} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.redDark} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  balanceCard: { gap: 8, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder, backgroundColor: ucapsaBrand.colors.successSoft, padding: 16, marginBottom: 10 },
  balanceTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  balanceStatus: { color: ucapsaBrand.colors.successDark, fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8 },
  balanceStatusPremium: { color: ucapsaBrand.colors.premiumActionText },
  balanceCardPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumHero },
  balanceLabel: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '900', textTransform: 'uppercase' },
  balanceValue: { color: ucapsaBrand.colors.text, fontSize: 29, lineHeight: 35, fontWeight: '900' },
  reviewNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 14 },
  reviewNoteTitle: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  reviewNoteText: { marginTop: 2, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  section: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 14 },
  sectionPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  count: { minWidth: 32, minHeight: 32, textAlign: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', paddingVertical: 7 },
  countPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.16), color: ucapsaBrand.colors.premiumActionText },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.borderNeutral, paddingTop: 10 },
  rowPremium: { borderTopColor: ucapsaBrand.colors.premiumBorder },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  amount: { color: ucapsaBrand.colors.warningDark, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  amountPremium: { color: ucapsaBrand.colors.premiumActionText },
  paidAmount: { color: ucapsaBrand.colors.successDark, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  paidAmountPremium: { color: ucapsaBrand.colors.successDark },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  bankWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, borderWidth: 1, padding: 11 },
  bankWarningText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  bankUnavailableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.borderNeutral, paddingTop: 10 },
  bankLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '900', textTransform: 'uppercase' },
  bankValue: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 21, fontWeight: '900', marginTop: 2 },
  smallCopy: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  smallCopyPremium: { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  receiptBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redPale, padding: 12, marginTop: 2 },
  receiptBoxPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  receiptTitle: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  receiptText: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 2 },
  copyButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 12, marginTop: 2 },
  copyButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  whatsappButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 12, paddingHorizontal: 12 },
  whatsappButtonPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  whatsappButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 14, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  whatsappButtonTextPremium: { color: ucapsaBrand.colors.premiumActionText },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingVertical: 12, paddingHorizontal: 12 },
  secondaryButtonPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  secondaryButtonTextPremium: { color: ucapsaBrand.colors.premiumActionText },
  link: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
});
