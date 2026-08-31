import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getAdminCustomerRecord,
  type AdminCustomerPayment,
  type AdminCustomerPaymentObligation,
  type AdminCustomerRecord,
} from '../../services/admin-customer.service';
import { deleteCustomerPayment, registerCustomerPayment, updateCustomerPayment } from '../../services/payments.service';

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

function dateKey(value: string | null | undefined) {
  return (value || new Date().toISOString()).slice(0, 10);
}

function dateToIso(value: string) {
  return `${value}T12:00:00.000Z`;
}

type ObligationWithBalance = AdminCustomerPaymentObligation & { paid: number; balance: number };

type PaymentForm = {
  payment: AdminCustomerPayment | null;
  amount: string;
  method: string;
  date: string;
  notes: string;
  concept: string;
  obligationId: string;
};

const emptyForm: PaymentForm = { payment: null, amount: '', method: 'manual', date: dateKey(null), notes: '', concept: 'Pago manual', obligationId: '' };

export default function CustomerPaymentsScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [form, setForm] = useState<PaymentForm>(emptyForm);
  const [visibleCount, setVisibleCount] = useState(8);

  const load = useCallback(async () => {
    if (!isAdmin || !userId) return;
    setRecord(await getAdminCustomerRecord(userId));
  }, [isAdmin, userId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [load]));

  const obligations = useMemo<ObligationWithBalance[]>(() => {
    if (!record) return [];
    const paid = new Map<string, number>();
    for (const payment of record.payments) {
      if (!payment.obligation_id || payment.status !== 'paid') continue;
      paid.set(payment.obligation_id, (paid.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
    }
    return record.obligations
      .filter((item) => !item.cancelled_at)
      .map((item) => ({ ...item, paid: paid.get(item.id) ?? 0, balance: Math.max(0, Number(item.amount ?? 0) - (paid.get(item.id) ?? 0)) }))
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [record]);

  const openObligations = obligations.filter((item) => item.balance > 0.005);
  const selectableObligations = form.payment ? obligations : openObligations;
  const totalBalance = openObligations.reduce((sum, item) => sum + item.balance, 0);

  function openNew(obligation?: ObligationWithBalance) {
    setForm({
      payment: null,
      amount: obligation ? String(obligation.balance) : '',
      method: 'manual',
      date: dateKey(null),
      notes: '',
      concept: obligation?.concept || 'Pago manual',
      obligationId: obligation?.id || '',
    });
    setCalendarOpen(false);
    setModalOpen(true);
  }

  function openCorrection(payment: AdminCustomerPayment) {
    setForm({
      payment,
      amount: String(Number(payment.amount ?? 0)),
      method: payment.payment_method || 'manual',
      date: dateKey(payment.paid_at || payment.created_at),
      notes: payment.notes || '',
      concept: payment.concept || 'Pago manual',
      obligationId: payment.obligation_id || '',
    });
    setCalendarOpen(false);
    setModalOpen(true);
  }

  function selectObligation(item: ObligationWithBalance) {
    setForm((current) => ({
      ...current,
      obligationId: item.id,
      amount: current.payment ? current.amount : String(item.balance),
      concept: item.concept,
    }));
  }

  async function savePayment() {
    if (!record) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Monto invalido', 'Escribe un monto mayor a cero.');
      return;
    }
    try {
      setSaving(true);
      if (form.payment) {
        await updateCustomerPayment(form.payment.id, {
          amount,
          notes: form.notes,
          paymentMethod: form.method,
          paidAt: dateToIso(form.date),
          obligationId: form.obligationId || null,
          concept: form.concept,
        });
      } else {
        await registerCustomerPayment({
          userId,
          membershipId: record.membership?.id ?? null,
          obligationId: form.obligationId || null,
          amount,
          concept: form.concept,
          notes: form.notes,
          paymentMethod: form.method,
          paidAt: dateToIso(form.date),
          periodLabel: form.obligationId ? obligations.find((item) => item.id === form.obligationId)?.concept ?? null : null,
        });
      }
      setModalOpen(false);
      await load();
      Alert.alert(form.payment ? 'Pago corregido' : 'Pago registrado', 'El historial y el saldo se actualizaron.');
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function removePayment(payment: AdminCustomerPayment) {
    Alert.alert('Eliminar pago', 'El pago se eliminara del historial y el saldo se recalculara.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          setSaving(true);
          await deleteCustomerPayment(payment.id);
          setModalOpen(false);
          await load();
        } catch (cause) {
          Alert.alert('No se pudo eliminar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
        } finally {
          setSaving(false);
        }
      } },
    ]);
  }

  if (!isAdmin) return <KeyboardAwareScreen><Text style={styles.title}>Acceso restringido</Text></KeyboardAwareScreen>;

  return (
    <KeyboardAwareScreen>
      <AdminCustomerContextHeader customerName={adminCustomerDisplayName(record?.profile)} section="Pagos" subtitle="Pagos, obligaciones y correcciones del cliente seleccionado." member={record?.membership?.status === 'active'} onBack={() => router.back()} />

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}

      {record ? (
        <>
          <View style={styles.summaryCard}>
            <View><Text style={styles.summaryLabel}>Saldo pendiente</Text><Text style={styles.summaryValue}>{money(totalBalance)}</Text></View>
            <Pressable style={styles.addButton} onPress={() => openNew()}><MaterialIcons name="add" size={19} color={ucapsaBrand.colors.surface} /><Text style={styles.addText}>Registrar</Text></Pressable>
          </View>

          <Text style={styles.sectionTitle}>Pendientes</Text>
          {openObligations.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Sin cargos pendientes</Text><Text style={styles.muted}>Puedes registrar un pago manual si hace falta.</Text></View> : null}
          {openObligations.slice(0, 5).map((item) => (
            <Pressable key={item.id} style={styles.obligation} onPress={() => openNew(item)}>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.concept}</Text><Text style={styles.rowMeta}>Vence {item.due_date}</Text></View>
              <View style={styles.balanceBox}><Text style={styles.balance}>{money(item.balance)}</Text><Text style={styles.linkText}>Registrar pago</Text></View>
            </Pressable>
          ))}
          {openObligations.length > 5 ? <Text style={styles.moreHint}>Mostrando los 5 cargos mas proximos.</Text> : null}

          <Text style={styles.sectionTitle}>Historial</Text>
          {record.payments.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Sin pagos</Text><Text style={styles.muted}>Todavia no hay pagos registrados.</Text></View> : null}
          <View style={styles.list}>
            {record.payments.slice(0, visibleCount).map((payment, index) => (
              <Pressable key={payment.id} style={[styles.row, index === Math.min(record.payments.length, visibleCount) - 1 && styles.rowLast]} onPress={() => openCorrection(payment)}>
                <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{payment.concept}</Text><Text style={styles.rowMeta}>{dateKey(payment.paid_at || payment.created_at)} - {payment.payment_method || 'manual'}</Text></View>
                <View style={styles.balanceBox}><Text style={styles.balance}>{money(Number(payment.amount ?? 0))}</Text><Text style={styles.linkText}>Corregir</Text></View>
              </Pressable>
            ))}
          </View>
          {record.payments.length > visibleCount ? <Pressable style={styles.moreButton} onPress={() => setVisibleCount((value) => value + 8)}><Text style={styles.moreText}>Ver 8 mas</Text></Pressable> : null}
        </>
      ) : null}

      <KeyboardAwareModal visible={modalOpen} onClose={() => setModalOpen(false)}>
        <Text style={styles.modalCustomerName}>{adminCustomerDisplayName(record?.profile)}</Text>
        <Text style={styles.modalKicker}>Pago</Text>
        <Text style={styles.modalTitle}>{form.payment ? 'Corregir pago' : 'Registrar pago'}</Text>

        <Text style={styles.label}>Cargo relacionado</Text>
        <View style={styles.obligationChoices}>
          <Choice label="Sin cargo" active={!form.obligationId} onPress={() => setForm((current) => ({ ...current, obligationId: '' }))} />
          {selectableObligations.map((item) => <Choice key={item.id} label={`${item.concept} ${item.balance > 0.005 ? money(item.balance) : 'Pagado'}`} active={form.obligationId === item.id} onPress={() => selectObligation(item)} />)}
        </View>

        <Text style={styles.label}>Monto</Text>
        <TextInput value={form.amount} onChangeText={(amount) => setForm((current) => ({ ...current, amount }))} keyboardType="decimal-pad" placeholder="0.00" style={styles.input} />

        <Text style={styles.label}>Metodo</Text>
        <View style={styles.choiceRow}>
          {['manual', 'efectivo', 'transferencia', 'clip'].map((method) => <Choice key={method} label={method === 'manual' ? 'Otro' : method.charAt(0).toUpperCase() + method.slice(1)} active={form.method === method} onPress={() => setForm((current) => ({ ...current, method }))} />)}
        </View>

        <Text style={styles.label}>Fecha</Text>
        <Pressable style={styles.dateButton} onPress={() => setCalendarOpen((value) => !value)}><Text style={styles.dateText}>{form.date}</Text><MaterialIcons name="event" size={20} color={ucapsaBrand.colors.redDark} /></Pressable>
        {calendarOpen ? <Calendar current={form.date} markedDates={{ [form.date]: { selected: true, selectedColor: ucapsaBrand.colors.red } }} onDayPress={(day) => { setForm((current) => ({ ...current, date: day.dateString })); setCalendarOpen(false); }} theme={{ todayTextColor: ucapsaBrand.colors.red, arrowColor: ucapsaBrand.colors.red }} /> : null}

        <Text style={styles.label}>Concepto</Text>
        <TextInput value={form.concept} onChangeText={(concept) => setForm((current) => ({ ...current, concept }))} placeholder="Concepto" style={styles.input} />
        <Text style={styles.label}>Nota</Text>
        <TextInput value={form.notes} onChangeText={(notes) => setForm((current) => ({ ...current, notes }))} placeholder="Nota opcional" multiline style={[styles.input, styles.textArea]} />

        <Pressable disabled={saving} style={styles.primary} onPress={savePayment}><Text style={styles.primaryText}>{saving ? 'Guardando...' : form.payment ? 'Guardar correccion' : 'Registrar pago'}</Text></Pressable>
        {form.payment ? <Pressable disabled={saving} style={styles.deleteFull} onPress={() => removePayment(form.payment as AdminCustomerPayment)}><Text style={styles.deleteFullText}>Eliminar pago</Text></Pressable> : null}
        <Pressable disabled={saving} style={styles.secondary} onPress={() => setModalOpen(false)}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 16 },
  summaryLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  summaryValue: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900', marginTop: 2 },
  addButton: { marginLeft: 'auto', flexDirection: 'row', gap: 5, alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 12, paddingVertical: 10 },
  addText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900', marginTop: 4, marginBottom: 8 },
  empty: { borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 10 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginBottom: 3 },
  obligation: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13, marginBottom: 8 },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  rowMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, marginTop: 2 },
  balanceBox: { alignItems: 'flex-end' },
  balance: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  linkText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', marginTop: 2 },
  moreHint: { color: ucapsaBrand.colors.muted, fontSize: 11, marginBottom: 8 },
  list: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  moreButton: { alignItems: 'center', paddingVertical: 12 },
  moreText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 24, fontWeight: '900', marginBottom: 10 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 8, marginBottom: 5 },
  obligationChoices: { gap: 7 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  choiceActive: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.red },
  choiceText: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '900' },
  choiceTextActive: { color: ucapsaBrand.colors.redDark },
  input: { borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text },
  textArea: { minHeight: 82, textAlignVertical: 'top' },
  dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, padding: 12 },
  dateText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  primary: { marginTop: 12, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', paddingVertical: 13 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  deleteFull: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, alignItems: 'center', paddingVertical: 12 },
  deleteFullText: { color: ucapsaBrand.colors.danger, fontSize: 13, fontWeight: '900' },
  secondary: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, alignItems: 'center', paddingVertical: 12 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  modalCustomerName: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900', marginBottom: 6 },
});
