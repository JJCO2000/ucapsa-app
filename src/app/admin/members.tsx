import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { registerMembershipPayment } from '../../services/payments.service';
import {
  formatDate,
  getAdminMembershipRows,
  getDisplayName,
  getMembershipStatusLabel,
  getPaymentStatusLabel,
  isMembershipDateExpired,
  markMembershipPaidFast,
  updateMembershipPaymentStatus,
  updateMembershipStatus,
  type MembershipAdminRow,
} from '../../services/memberships.service';
import type { MembershipPaymentStatus, MembershipStatus } from '../../types/app.types';
import { useSession } from '../../hooks/useSession';

const TABLE_PREFS_KEY = 'ucapsa.admin.members.visibleColumns.v1';

type VisibleColumns = {
  email: boolean;
  id: boolean;
  payment: boolean;
  validity: boolean;
};

const defaultColumns: VisibleColumns = {
  email: true,
  id: false,
  payment: true,
  validity: true,
};

export default function AdminMembersScreen() {
  const { isAdmin } = useSession();
  const [rows, setRows] = useState<MembershipAdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<VisibleColumns>(defaultColumns);
  const [selected, setSelected] = useState<MembershipAdminRow | null>(null);
  const [memberNumber, setMemberNumber] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [periodLabel, setPeriodLabel] = useState('Mensualidad');

  const loadRows = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const data = await getAdminMembershipRows();
      setRows(data);
    } catch (error) {
      Alert.alert('No se pudieron cargar socios', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    AsyncStorage.getItem(TABLE_PREFS_KEY).then((value) => {
      if (!value) return;
      try {
        setColumns({ ...defaultColumns, ...JSON.parse(value) });
      } catch {
        setColumns(defaultColumns);
      }
    });
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const stats = useMemo(() => {
    const pending = rows.filter((row) => row.membership.status === 'pending').length;
    const active = rows.filter((row) => row.membership.status === 'active').length;
    const paymentPending = rows.filter((row) => row.membership.current_payment_status !== 'paid').length;
    const expiredByDate = rows.filter((row) => isMembershipDateExpired(row.membership) && row.membership.status === 'active').length;
    const deletionRequests = rows.filter((row) => row.profile?.deletion_requested_at).length;

    return { pending, active, paymentPending, expiredByDate, deletionRequests, total: rows.length };
  }, [rows]);

  function openDetail(row: MembershipAdminRow) {
    setSelected(row);
    setMemberNumber(row.membership.member_number ?? '');
    setStartDate(row.membership.start_date?.slice(0, 10) ?? '');
    setEndDate(row.membership.end_date?.slice(0, 10) ?? '');
    setPaymentNotes(row.membership.payment_notes ?? '');
    setPaymentAmount('');
    setPeriodLabel('Mensualidad');
  }

  async function toggleColumn(key: keyof VisibleColumns) {
    const next = { ...columns, [key]: !columns[key] };
    setColumns(next);
    await AsyncStorage.setItem(TABLE_PREFS_KEY, JSON.stringify(next));
  }

  async function handleStatus(status: MembershipStatus) {
    if (!selected) return;
    try {
      await updateMembershipStatus(selected.membership, status, {
        memberNumber,
        startDate: startDate || null,
        endDate: endDate || null,
        paymentNotes,
      });
      await loadRows();
      setSelected(null);
    } catch (error) {
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    }
  }

  async function handleQuickPayment(row: MembershipAdminRow, status: MembershipPaymentStatus) {
    try {
      if (status === 'paid') {
        await markMembershipPaidFast(row);
      } else {
        await updateMembershipPaymentStatus(row.membership.id, status, 'Actualizado desde tabla de socios.');
      }
      await loadRows();
    } catch (error) {
      Alert.alert('No se pudo actualizar pago', error instanceof Error ? error.message : 'Intenta de nuevo.');
    }
  }

  async function handleRegisterPayment() {
    if (!selected) return;

    try {
      const amount = paymentAmount.trim() ? Number(paymentAmount) : 0;
      await registerMembershipPayment({
        userId: selected.membership.user_id,
        membershipId: selected.membership.id,
        amount: Number.isFinite(amount) ? amount : 0,
        notes: paymentNotes,
        periodLabel,
        paymentMethod: 'manual',
      });
      await loadRows();
      Alert.alert('Pago registrado', 'El historial del socio fue actualizado.');
    } catch (error) {
      Alert.alert('No se pudo registrar pago', error instanceof Error ? error.message : 'Intenta de nuevo.');
    }
  }

  if (!isAdmin) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.title}>Acceso restringido</Text>
        <Text style={styles.muted}>Solo admin y super_admin pueden ver socios.</Text>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen>
      <Text style={styles.eyebrow}>Administracion</Text>
      <Text style={styles.title}>Socios</Text>
      <Text style={styles.muted}>Tabla de socios, solicitudes, pagos manuales y detalle completo.</Text>

      <Pressable style={styles.scanButton} onPress={() => router.push('/admin/scanner?mode=member' as never)}>
        <Text style={styles.scanButtonText}>Escanear QR de socio</Text>
      </Pressable>

      <View style={styles.metricsGrid}>
        <Metric label="Total" value={stats.total} />
        <Metric label="Pendientes" value={stats.pending} />
        <Metric label="Activos" value={stats.active} />
        <Metric label="Pago pendiente" value={stats.paymentPending} />
        <Metric label="Vigencia vencida" value={stats.expiredByDate} />
        <Metric label="Eliminar cuenta" value={stats.deletionRequests} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Columnas visibles</Text>
        <ColumnToggle label="Correo" value={columns.email} onChange={() => toggleColumn('email')} />
        <ColumnToggle label="ID" value={columns.id} onChange={() => toggleColumn('id')} />
        <ColumnToggle label="Pago" value={columns.payment} onChange={() => toggleColumn('payment')} />
        <ColumnToggle label="Vigencia" value={columns.validity} onChange={() => toggleColumn('validity')} />
      </View>

      <View style={styles.tableHeaderRow}>
        <Text style={styles.sectionTitle}>Tabla de socios</Text>
        <Pressable onPress={loadRows} style={styles.refreshButton}>
          <Text style={styles.refreshText}>{loading ? 'Cargando...' : 'Actualizar'}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
        <View>
          <View style={styles.rowHeader}>
            <Cell text="Nombre" header width={170} />
            {columns.email ? <Cell text="Correo" header width={210} /> : null}
            <Cell text="Socio" header width={110} />
            {columns.id ? <Cell text="ID" header width={190} /> : null}
            <Cell text="Estado" header width={120} />
            {columns.payment ? <Cell text="Pago" header width={120} /> : null}
            {columns.validity ? <Cell text="Vigencia" header width={130} /> : null}
            <Cell text="Acciones" header width={210} />
          </View>

          {rows.map((row) => (
            <Pressable key={row.membership.id} onPress={() => openDetail(row)} style={styles.row}>
              <Cell text={getDisplayName(row.profile)} width={170} />
              {columns.email ? <Cell text={row.profile?.email ?? 'Sin correo'} width={210} /> : null}
              <Cell text={row.membership.member_number ?? 'Pendiente'} width={110} />
              {columns.id ? <Cell text={row.membership.user_id} width={190} /> : null}
              <Cell text={getMembershipStatusLabel(row.membership.status)} width={120} />
              {columns.payment ? <Cell text={getPaymentStatusLabel(row.membership.current_payment_status)} width={120} /> : null}
              {columns.validity ? <Cell text={formatDate(row.membership.end_date)} width={130} /> : null}
              <View style={[styles.cell, { width: 210 }]}>
                <View style={styles.quickActions}>
                  <Pressable onPress={() => handleQuickPayment(row, 'paid')} style={styles.smallSuccessButton}>
                    <Text style={styles.smallButtonText}>Pagado</Text>
                  </Pressable>
                  <Pressable onPress={() => handleQuickPayment(row, 'pending')} style={styles.smallWarnButton}>
                    <Text style={styles.smallButtonText}>Pendiente</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <MemberDetailModal
        row={selected}
        memberNumber={memberNumber}
        setMemberNumber={setMemberNumber}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        paymentNotes={paymentNotes}
        setPaymentNotes={setPaymentNotes}
        paymentAmount={paymentAmount}
        setPaymentAmount={setPaymentAmount}
        periodLabel={periodLabel}
        setPeriodLabel={setPeriodLabel}
        onClose={() => setSelected(null)}
        onStatus={handleStatus}
        onRegisterPayment={handleRegisterPayment}
      />
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ColumnToggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function Cell({ text, width, header }: { text: string; width: number; header?: boolean }) {
  return (
    <View style={[styles.cell, { width }, header && styles.headerCell]}>
      <Text numberOfLines={2} style={header ? styles.headerCellText : styles.cellText}>{text}</Text>
    </View>
  );
}

function MemberDetailModal({
  row,
  memberNumber,
  setMemberNumber,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  paymentNotes,
  setPaymentNotes,
  paymentAmount,
  setPaymentAmount,
  periodLabel,
  setPeriodLabel,
  onClose,
  onStatus,
  onRegisterPayment,
}: {
  row: MembershipAdminRow | null;
  memberNumber: string;
  setMemberNumber: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  paymentNotes: string;
  setPaymentNotes: (value: string) => void;
  paymentAmount: string;
  setPaymentAmount: (value: string) => void;
  periodLabel: string;
  setPeriodLabel: (value: string) => void;
  onClose: () => void;
  onStatus: (status: MembershipStatus) => void;
  onRegisterPayment: () => void;
}) {
  if (!row) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAwareScreen contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>{getDisplayName(row.profile)}</Text>
          <Text style={styles.muted}>Detalle completo del socio y membresia.</Text>

          <View style={styles.detailBox}>
            <Detail label="Nombre" value={getDisplayName(row.profile)} />
            <Detail label="Correo" value={row.profile?.email ?? 'Sin correo'} />
            <Detail label="Telefono" value={row.profile?.phone ?? 'Sin telefono'} />
            <Detail label="Perro" value={row.profile?.dog_name ?? 'Sin registrar'} />
            <Detail label="Role" value={row.profile?.role ?? 'Sin perfil'} />
            <Detail label="Registro" value={formatDate(row.profile?.created_at)} />
            <Detail label="User ID" value={row.membership.user_id} />
            <Detail label="Membership ID" value={row.membership.id} />
            <Detail label="QR token" value={row.membership.qr_token} />
            <Detail label="Estado" value={getMembershipStatusLabel(row.membership.status)} />
            <Detail label="Pago" value={getPaymentStatusLabel(row.membership.current_payment_status)} />
          </View>

          <Text style={styles.label}>Numero de socio</Text>
          <TextInput value={memberNumber} onChangeText={setMemberNumber} placeholder="Ej. SOC-2026-001" style={styles.input} />

          <Text style={styles.label}>Fecha de inicio</Text>
          <TextInput value={startDate} onChangeText={setStartDate} placeholder="AAAA-MM-DD" style={styles.input} />

          <Text style={styles.label}>Fecha de vigencia</Text>
          <TextInput value={endDate} onChangeText={setEndDate} placeholder="AAAA-MM-DD" style={styles.input} />

          <View style={styles.actionGrid}>
            <Action label="Aprobar/activar" style={styles.successButton} onPress={() => onStatus('active')} />
            <Action label="Rechazar" style={styles.warnButton} onPress={() => onStatus('rejected')} />
            <Action label="Vencido" style={styles.warnButton} onPress={() => onStatus('expired')} />
            <Action label="Cancelar" style={styles.dangerButton} onPress={() => onStatus('cancelled')} />
          </View>

          <Text style={styles.sectionTitle}>Registrar pago manual</Text>
          <Text style={styles.label}>Monto opcional</Text>
          <TextInput value={paymentAmount} onChangeText={setPaymentAmount} placeholder="0" style={styles.input} keyboardType="decimal-pad" />

          <Text style={styles.label}>Periodo</Text>
          <TextInput value={periodLabel} onChangeText={setPeriodLabel} placeholder="Mensualidad" style={styles.input} />

          <Text style={styles.label}>Nota de pago</Text>
          <TextInput value={paymentNotes} onChangeText={setPaymentNotes} placeholder="Ej. Pago en efectivo" style={[styles.input, styles.multiline]} multiline />

          <Pressable onPress={onRegisterPayment} style={styles.successFullButton}>
            <Text style={styles.buttonText}>Registrar pago</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Historial de pagos</Text>
          {row.payments.length === 0 ? (
            <Text style={styles.muted}>Sin pagos registrados.</Text>
          ) : (
            row.payments.map((payment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <Text style={styles.paymentTitle}>{payment.period_label || payment.concept}</Text>
                <Text style={styles.paymentText}>Fecha: {formatDate(payment.paid_at)}</Text>
                <Text style={styles.paymentText}>Monto: ${payment.amount}</Text>
                <Text style={styles.paymentText}>Nota: {payment.notes || 'Sin nota'}</Text>
              </View>
            ))
          )}

          {row.profile?.deletion_requested_at ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>Este usuario solicito eliminacion de cuenta el {formatDate(row.profile.deletion_requested_at)}.</Text>
            </View>
          ) : null}

          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Cerrar</Text>
          </Pressable>
        </KeyboardAwareScreen>
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value || 'Sin dato'}</Text>
    </View>
  );
}

function Action({ label, onPress, style }: { label: string; onPress: () => void; style: object }) {
  return (
    <Pressable onPress={onPress} style={[styles.actionButton, style]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: '#0f766e', fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '900', marginTop: 6 },
  muted: { color: '#64748b', fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 14 },
  scanButton: { alignItems: 'center', borderRadius: 16, paddingVertical: 13, backgroundColor: '#0f766e', marginBottom: 14 },
  scanButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metric: { width: '48%', backgroundColor: '#ffffff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  metricValue: { color: '#0f172a', fontSize: 26, fontWeight: '900' },
  metricLabel: { color: '#64748b', fontSize: 12, fontWeight: '800', marginTop: 2 },
  card: { backgroundColor: '#ffffff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900', marginTop: 4, marginBottom: 10 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  toggleLabel: { color: '#334155', fontSize: 15, fontWeight: '800' },
  tableHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshButton: { backgroundColor: '#0f766e', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  refreshText: { color: '#ffffff', fontWeight: '900' },
  tableScroll: { marginTop: 8, marginBottom: 30 },
  rowHeader: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  row: { flexDirection: 'row', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  cell: { padding: 10, minHeight: 58, justifyContent: 'center' },
  headerCell: { minHeight: 44 },
  headerCellText: { color: '#334155', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  cellText: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  quickActions: { flexDirection: 'row', gap: 6 },
  smallSuccessButton: { backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  smallWarnButton: { backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  smallButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  modalContent: { backgroundColor: '#f8fafc', marginTop: 40, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 40 },
  modalTitle: { color: '#0f172a', fontSize: 26, fontWeight: '900' },
  detailBox: { backgroundColor: '#ffffff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14 },
  detailRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  detailLabel: { color: '#64748b', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: '#0f172a', fontSize: 14, fontWeight: '700', marginTop: 3 },
  label: { color: '#334155', fontSize: 13, fontWeight: '900', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: '#0f172a', fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionButton: { width: '48%', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  successButton: { backgroundColor: '#16a34a' },
  warnButton: { backgroundColor: '#f59e0b' },
  dangerButton: { backgroundColor: '#dc2626' },
  successFullButton: { backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  buttonText: { color: '#ffffff', fontWeight: '900' },
  paymentRow: { backgroundColor: '#ffffff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8 },
  paymentTitle: { color: '#0f172a', fontSize: 15, fontWeight: '900' },
  paymentText: { color: '#64748b', fontSize: 13, marginTop: 3 },
  warningBox: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 12 },
  warningText: { color: '#9a3412', fontWeight: '800', lineHeight: 20 },
  closeButton: { backgroundColor: '#0f172a', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  closeButtonText: { color: '#ffffff', fontWeight: '900' },
});

