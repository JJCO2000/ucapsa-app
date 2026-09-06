import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getAdminCustomerRecord, type AdminCustomerRecord } from '../../services/admin-customer.service';
import { formatDate as formatMembershipDate, getMembershipStatusLabel } from '../../services/memberships.service';
import { formatProgramScheduleDisplayLabel, getProgramLevelLabel, getProgramStatusLabel } from '../../services/programs.service';

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

type SectionKey = 'profile' | 'membership' | 'classes' | 'attendance' | 'payments';

const titles: Record<SectionKey, string> = {
  profile: 'Datos',
  membership: 'Membresia',
  classes: 'Clases',
  attendance: 'Asistencias',
  payments: 'Pagos',
};

export default function CustomerSectionScreen() {
  const params = useLocalSearchParams<{ userId?: string; section?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const rawSection = typeof params.section === 'string' ? params.section : 'profile';
  const section: SectionKey = ['profile', 'membership', 'classes', 'attendance', 'payments'].includes(rawSection) ? rawSection as SectionKey : 'profile';
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError('');
      setRecord(await getAdminCustomerRecord(userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el cliente.');
      setRecord(null);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (!userId) return undefined;
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [load, userId]));

  const attendanceRows = useMemo(() => {
    if (!record) return [];
    return record.enrollments
      .flatMap((item) => item.attendances.map((attendance) => ({ attendance, item })))
      .sort((a, b) => b.attendance.attendance_date.localeCompare(a.attendance.attendance_date));
  }, [record]);

  const paymentSummary = useMemo(() => {
    if (!record) return { balance: 0, open: [] as Array<{ id: string; concept: string; dueDate: string; balance: number }> };
    const paid = new Map<string, number>();
    for (const payment of record.payments) {
      if (!payment.obligation_id || payment.status !== 'paid') continue;
      paid.set(payment.obligation_id, (paid.get(payment.obligation_id) ?? 0) + Number(payment.amount ?? 0));
    }
    const open = record.obligations
      .filter((item) => !item.cancelled_at)
      .map((item) => ({ id: item.id, concept: item.concept, dueDate: item.due_date, balance: Math.max(0, Number(item.amount ?? 0) - (paid.get(item.id) ?? 0)) }))
      .filter((item) => item.balance > 0.005)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return { balance: open.reduce((sum, item) => sum + item.balance, 0), open };
  }, [record]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!userId) return <KeyboardAwareScreen><View style={styles.center}><Text style={styles.title}>Cliente no disponible</Text><Pressable style={styles.primary} onPress={() => router.replace('/admin-clients' as never)}><Text style={styles.primaryText}>Ir a Clientes</Text></Pressable></View></KeyboardAwareScreen>;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <AdminCustomerContextHeader customerName={adminCustomerDisplayName(record?.profile)} section={titles[section]} member={record?.membership?.status === 'active'} onBack={() => router.back()} />

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {record && section === 'profile' ? (
        <>
          <View style={styles.card}>
            <Detail label="Nombre" value={record.profile.full_name || 'Sin nombre'} />
            <Detail label="Correo" value={record.profile.email || 'Sin correo'} />
            <Detail label="Telefono" value={record.profile.phone || 'Sin telefono'} />
            <Detail label="Perros" value={record.dogs.length > 0 ? record.dogs.map((dog) => dog.name).join(', ') : record.enrollments.map((item) => item.dog?.name).filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(', ') || 'Sin registrar'} last />
          </View>
          <Action label="Editar datos" icon="edit" onPress={() => router.push(`/admin/customer-profile-edit?userId=${encodeURIComponent(userId)}` as never)} />
        </>
      ) : null}

      {record && section === 'membership' ? (
        <>
          <View style={styles.card}>
            {record.membership ? (
              <>
                <Detail label="Estado" value={getMembershipStatusLabel(record.membership.status)} />
                <Detail label="Numero de socio" value={record.membership.member_number || 'Pendiente'} />
                <Detail label="Inicio" value={formatMembershipDate(record.membership.start_date)} />
                <Detail label="Vigencia" value={formatMembershipDate(record.membership.end_date)} last />
              </>
            ) : <Text style={styles.muted}>Este cliente no tiene membresia.</Text>}
          </View>
          <Action label="Editar membresia" icon="badge" onPress={() => router.push(`/admin/customer-membership?userId=${encodeURIComponent(userId)}` as never)} />
          <Action label="Ir a pagos" icon="payments" onPress={() => router.push(`/admin/customer-payments?userId=${encodeURIComponent(userId)}` as never)} />
        </>
      ) : null}

      {record && section === 'classes' ? (
        <>
          {record.enrollments.length === 0 ? <Empty text="Sin inscripciones." /> : null}
          {record.enrollments.slice(0, 5).map((item) => (
            <Pressable key={item.enrollment.id} style={styles.item} onPress={() => router.push(`/admin/customer-class?userId=${encodeURIComponent(userId)}&enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}>
              <View style={styles.itemTop}><Text style={styles.itemTitle}>{item.program.name}</Text><Text style={styles.pill}>{getProgramStatusLabel(item.enrollment.status)}</Text></View>
              {item.program.code === 'comandos' ? <Text style={styles.itemMeta}>Nivel: {getProgramLevelLabel(item.enrollment.program_level)}</Text> : null}
              <Text style={styles.itemMeta}>Perro: {item.dog?.name || 'Sin registrar'}</Text>
              <Text style={styles.itemMeta}>{formatProgramScheduleDisplayLabel(item.schedule, item.program)}</Text>
              <Text style={styles.itemMeta}>{item.attendances.length} de {item.program.required_attendances} asistencias</Text>
              <Text style={styles.openHint}>Abrir clase</Text>
            </Pressable>
          ))}
          {record.enrollments.length > 5 ? <Text style={styles.muted}>Mostrando 5 inscripciones. Usa Clases para ver el resto.</Text> : null}
          <Action label="Nueva inscripcion" icon="add" onPress={() => router.push(`/admin/classes?userId=${encodeURIComponent(userId)}` as never)} />
        </>
      ) : null}

      {record && section === 'attendance' ? (
        <>
          {attendanceRows.length === 0 ? <Empty text="Sin asistencias registradas." /> : null}
          <View style={styles.listCard}>
            {attendanceRows.slice(0, 5).map(({ attendance, item }, index) => (
              <View key={attendance.id} style={[styles.listRow, index === Math.min(attendanceRows.length, 5) - 1 && styles.listRowLast]}>
                <View style={{ flex: 1 }}><Text style={styles.itemTitle}>{formatDate(attendance.attendance_date)}</Text><Text style={styles.itemMeta}>{item.program.name}{item.program.code === 'comandos' ? ` - ${getProgramLevelLabel(item.enrollment.program_level)}` : ''}</Text><Text style={styles.itemMeta}>{attendance.source === 'qr_client' ? 'QR cliente' : attendance.source === 'admin_manual' ? 'Manual admin' : 'Historico'}</Text></View>
              </View>
            ))}
          </View>
          {attendanceRows.length > 5 ? <Text style={styles.muted}>Mostrando las 5 asistencias mas recientes.</Text> : null}
          <Action label="Administrar asistencias" icon="fact-check" onPress={() => router.push(`/admin/customer-attendance?userId=${encodeURIComponent(userId)}` as never)} />
        </>
      ) : null}

      {record && section === 'payments' ? (
        <>
          <View style={styles.balanceCard}><Text style={styles.balanceLabel}>Saldo pendiente</Text><Text style={styles.balanceValue}>{money(paymentSummary.balance)}</Text></View>
          <Text style={styles.sectionTitle}>Cargos proximos</Text>
          {paymentSummary.open.length === 0 ? <Empty text="Sin cargos pendientes." /> : paymentSummary.open.slice(0, 3).map((item) => <View key={item.id} style={styles.item}><Text style={styles.itemTitle}>{item.concept}</Text><Text style={styles.itemMeta}>Vence {item.dueDate}</Text><Text style={styles.amount}>{money(item.balance)}</Text></View>)}
          <Text style={styles.sectionTitle}>Pagos recientes</Text>
          {record.payments.length === 0 ? <Empty text="Sin pagos registrados." /> : <View style={styles.listCard}>{record.payments.slice(0, 3).map((payment, index) => <View key={payment.id} style={[styles.listRow, index === Math.min(record.payments.length, 3) - 1 && styles.listRowLast]}><View style={{ flex: 1 }}><Text style={styles.itemTitle}>{payment.concept}</Text><Text style={styles.itemMeta}>{formatDate(payment.paid_at || payment.created_at)}</Text></View><Text style={styles.amount}>{money(Number(payment.amount ?? 0))}</Text></View>)}</View>}
          <Action label="Administrar pagos" icon="payments" onPress={() => router.push(`/admin/customer-payments?userId=${encodeURIComponent(userId)}` as never)} />
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Detail({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.detail, last && styles.detailLast]}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function Action({ label, icon, onPress }: { label: string; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void }) {
  return <Pressable style={styles.action} onPress={onPress}><MaterialIcons name={icon} size={19} color={ucapsaBrand.colors.redDark} /><Text style={styles.actionText}>{label}</Text><MaterialIcons name="chevron-right" size={21} color={ucapsaBrand.colors.redDark} /></Pressable>;
}

function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.muted}>{text}</Text></View>; }

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  error: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14, gap: 4 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  primary: { borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 16, paddingVertical: 12 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, gap: 10 },
  detail: { borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted, paddingBottom: 10 },
  detailLast: { borderBottomWidth: 0, paddingBottom: 0 },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoft, padding: 12, marginTop: 9 },
  actionText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  item: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 9 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  itemTitle: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  itemMeta: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  openHint: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', marginTop: 7 },
  pill: { color: ucapsaBrand.colors.redDark, backgroundColor: ucapsaBrand.colors.redSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  listCard: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden', marginBottom: 8 },
  listRow: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  listRowLast: { borderBottomWidth: 0 },
  balanceCard: { borderRadius: 18, backgroundColor: ucapsaBrand.colors.red, padding: 16, marginBottom: 12 },
  balanceLabel: { color: ucapsaBrand.colors.premiumMuted, fontSize: 11, fontWeight: '800' },
  balanceValue: { color: ucapsaBrand.colors.surface, fontSize: 23, fontWeight: '900', marginTop: 3 },
  amount: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginTop: 4 },
  empty: { borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 15, marginBottom: 9 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginTop: 6, marginBottom: 8 },
});
