import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getMyProgramEnrollments,
  getNextProgramScheduleDate,
  getProgramCodeLabel,
  getProgramLevelLabel,
  getProgramStatusLabel,
} from '../../services/programs.service';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function nextClassLabel(item: ProgramEnrollmentWithDetails) {
  const date = getNextProgramScheduleDate(item.schedule);
  if (!date) return 'Por confirmar';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]}${time ? `, ${time}` : ''}`;
}

function scheduleLabel(item: ProgramEnrollmentWithDetails) {
  const repeat = item.schedule.repeat_type === 'biweekly' ? 'Cada 2 semanas' : 'Cada semana';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[item.schedule.day_of_week] ?? 'Dia'} ${time || '--:--'} - ${repeat}`;
}

export default function ClientClassDetailScreen() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId?: string }>();
  const { user, isAdmin } = useSession();
  const [item, setItem] = useState<ProgramEnrollmentWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin || !enrollmentId) return;
    setError(null);
    try {
      const rows = await getMyProgramEnrollments();
      setItem(rows.find((row) => row.enrollment.id === enrollmentId) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la clase.');
    } finally {
      setLoading(false);
    }
  }, [enrollmentId, isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const recent = useMemo(() => [...(item?.attendances ?? [])].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)).slice(0, 5), [item]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-classes" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando clase...</Text></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>No se pudo cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}
      {!loading && !error && !item ? <View style={styles.empty}><Text style={styles.title}>Clase no encontrada</Text><Text style={styles.muted}>La inscripcion ya no esta disponible.</Text></View> : null}

      {item ? (
        <>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><MaterialIcons name="school" size={28} color={ucapsaBrand.colors.redDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>Mi clase</Text>
              <Text style={styles.title}>{getProgramCodeLabel(item.program.code)}</Text>
              <Text style={styles.subtitle}>{getProgramLevelLabel(item.enrollment.program_level)} - {getProgramStatusLabel(item.enrollment.status)}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <Info label="Proxima clase" value={nextClassLabel(item)} />
            <Info label="Horario" value={scheduleLabel(item)} />
            <Info label="Perro" value={item.enrollment.dog_name || item.profile?.dog_name || 'Sin registrar'} />
            <Info label="Asistencias" value={`${item.attendances.length} de ${item.program.required_attendances}`} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tarjeta de clase</Text>
            <InfoRow label="Inicio" value={dateLabel(item.enrollment.card_started_on || item.enrollment.started_at)} />
            <InfoRow label="Vigencia" value={dateLabel(item.enrollment.card_expires_on)} />
            <InfoRow label="Numero" value={item.enrollment.physical_card_number || 'Sin numero'} />
          </View>

          {item.enrollment.status === 'active' ? (
            <Pressable style={styles.primaryButton} onPress={() => router.push('/attendance' as never)}>
              <MaterialIcons name="qr-code-scanner" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Registrar asistencia</Text>
            </Pressable>
          ) : null}

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Asistencias recientes</Text>
                <Text style={styles.muted}>{item.attendances.length} registradas</Text>
              </View>
              {item.attendances.length > 5 ? (
                <Pressable onPress={() => router.push(`/client/attendance-history?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}><Text style={styles.link}>Ver todas</Text></Pressable>
              ) : null}
            </View>
            {recent.length === 0 ? <Text style={styles.muted}>Todavia no hay asistencias.</Text> : recent.map((attendance) => (
              <View key={attendance.id} style={styles.attendanceRow}>
                <MaterialIcons name="check-circle" size={19} color={ucapsaBrand.colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.attendanceDate}>{dateLabel(attendance.attendance_date)}</Text>
                  <Text style={styles.muted}>{attendance.source === 'qr_client' ? 'Registrada con QR' : 'Registro UCAPSA'}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoBox}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoRowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 20 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorBox: { gap: 5, borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 16 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 17, fontWeight: '900' },
  empty: { gap: 6, paddingVertical: 24 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '800', marginTop: 2 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  infoBox: { width: '48%', minHeight: 82, gap: 5, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 13 },
  infoLabel: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  infoValue: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  card: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 16, marginBottom: 14 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 10 },
  infoRowValue: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13, marginBottom: 14 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  link: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 10 },
  attendanceDate: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
});
