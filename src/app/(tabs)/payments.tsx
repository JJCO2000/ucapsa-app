import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview, getPaymentSettings } from '../../services/payments.service';
import type { MyPaymentOverview, PaymentObligationWithBalance, PaymentSettings } from '../../types/app.types';

const emptyOverview: MyPaymentOverview = { obligations: [], payments: [], outstanding_total: 0, attention_total: 0, future_total: 0, overdue_count: 0, legacy_membership_pending: false };
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function obligationStatusLabel(item: PaymentObligationWithBalance) {
  if (item.display_status === 'overdue') return 'Vencido';
  if (item.display_status === 'partial') return 'Parcial';
  if (item.display_status === 'future') return 'Futuro';
  if (item.display_status === 'paid') return 'Pagado';
  return 'Pendiente';
}

export default function PaymentsTab() {
  const { user, isAdmin } = useSession();
  const [overview, setOverview] = useState<MyPaymentOverview>(emptyOverview);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    try {
      const [paymentOverview, bankSettings] = await Promise.all([getMyPaymentOverview(), getPaymentSettings()]);
      setOverview(paymentOverview);
      setSettings(bankSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus pagos.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function copyClabe() {
    if (!settings?.clabe) return;
    await Clipboard.setStringAsync(settings.clabe);
    Alert.alert('CLABE copiada', 'Ya puedes pegarla en tu aplicacion bancaria.');
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-payments" />;

  const recentPayments = overview.payments.slice(0, 3);
  const recentObligations = overview.obligations.slice(0, 3);
  const bankReady = Boolean(settings?.is_active && settings.clabe && settings.bank_name && settings.account_holder);

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Mi UCAPSA</Text>
        <Text style={styles.title}>Pagos</Text>
        <Text style={styles.subtitle}>Consulta saldos, transferencias y pagos registrados.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando pagos...</Text></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>No se pudieron cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error ? (
        <>
          <View style={[styles.balanceCard, (overview.attention_total > 0.005 || overview.legacy_membership_pending) && styles.balanceCardPending]}>
            <Text style={styles.balanceLabel}>Por pagar</Text>
            <Text style={styles.balanceValue}>{overview.outstanding_total > 0.005 ? money(overview.outstanding_total) : 'Sin saldo'}</Text>
            <Text style={styles.muted}>
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
          </View>

          {recentObligations.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Cargos abiertos</Text><Text style={styles.count}>{overview.obligations.length}</Text></View>
              {recentObligations.map((item) => (
                <View key={item.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.concept}</Text>
                    <Text style={styles.muted}>Vence: {dateLabel(item.due_date)} - {obligationStatusLabel(item)}</Text>
                  </View>
                  <Text style={styles.amount}>{money(item.remaining_amount)}</Text>
                </View>
              ))}
              {overview.obligations.length > 3 ? <Text style={styles.hint}>El historial completo esta en la vista de historial.</Text> : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transferencia bancaria</Text>
            {bankReady ? (
              <>
                <BankRow label="Banco" value={settings?.bank_name ?? ''} />
                <BankRow label="Titular" value={settings?.account_holder ?? ''} />
                <BankRow label="CLABE" value={settings?.clabe ?? ''} selectable />
                {settings?.transfer_instructions ? <BankRow label="Concepto / referencia" value={settings.transfer_instructions} /> : null}
                <Pressable style={styles.copyButton} onPress={() => void copyClabe()}>
                  <MaterialIcons name="content-copy" size={19} color="#fff" />
                  <Text style={styles.copyButtonText}>Copiar CLABE</Text>
                </Pressable>
                {settings?.clip_url ? (
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => void Linking.openURL(settings.clip_url as string).catch(() => Alert.alert('No se pudo abrir', 'Revisa el enlace de pago con UCAPSA.'))}
                  >
                    <Text style={styles.secondaryButtonText}>Abrir enlace de pago</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={styles.muted}>Los datos bancarios todavia no estan disponibles. Consulta con UCAPSA antes de transferir.</Text>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pagos recientes</Text>
              {overview.payments.length > 0 ? <Pressable onPress={() => router.push('/client/payment-history' as never)}><Text style={styles.link}>Ver historial</Text></Pressable> : null}
            </View>
            {recentPayments.length === 0 ? <Text style={styles.muted}>Todavia no hay pagos registrados.</Text> : recentPayments.map((payment) => (
              <View key={payment.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{payment.period_label || payment.concept}</Text>
                  <Text style={styles.muted}>{dateLabel(payment.paid_at)}</Text>
                </View>
                <Text style={styles.paidAmount}>{money(Number(payment.amount ?? 0))}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function BankRow({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return <View style={styles.bankRow}><Text style={styles.bankLabel}>{label}</Text><Text selectable={selectable} style={styles.bankValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorBox: { gap: 5, borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 16 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 17, fontWeight: '900' },
  balanceCard: { gap: 5, borderRadius: 22, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', padding: 18, marginBottom: 14 },
  balanceCardPending: { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' },
  balanceLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  balanceValue: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900' },
  section: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 16, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  count: { minWidth: 28, textAlign: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', paddingVertical: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 10 },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  amount: { color: ucapsaBrand.colors.warning, fontSize: 14, fontWeight: '900' },
  paidAmount: { color: ucapsaBrand.colors.success, fontSize: 14, fontWeight: '900' },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700' },
  bankRow: { gap: 3, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 10 },
  bankLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  bankValue: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 12, marginTop: 2 },
  copyButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingVertical: 12 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  link: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
});
