import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
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
  const { user, role, isAdmin } = useSession();
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
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: Boolean(item?.enrollment.status === 'active') }), [isAdmin, item?.enrollment.status, role, user]);
  const premium = format.key === 'member';

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-classes" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando clase...</Text></View> : null}
      {error ? <View style={[styles.errorBox, premium && styles.errorBoxPremium]}><Text style={[styles.errorTitle, premium && styles.errorTitlePremium]}>No se pudo cargar</Text><Text style={[styles.muted, { color: premium ? '#FFE3E8' : format.muted }]}>{error}</Text></View> : null}
      {!loading && !error && !item ? <View style={styles.empty}><Text style={[styles.title, { color: format.text }]}>Clase no encontrada</Text><Text style={[styles.muted, { color: format.muted }]}>La inscripcion ya no esta disponible.</Text></View> : null}

      {item ? (
        <>
          <View style={[styles.hero, premium && styles.heroPremium]}>
            <View style={[styles.heroIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="school" size={28} color={format.pillText} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: premium ? '#FFE8B5' : format.accentDark }]}>Mi clase</Text>
              <Text style={[styles.title, { color: format.text }]}>{getProgramCodeLabel(item.program.code)}</Text>
              <Text style={[styles.subtitle, { color: format.muted }]}>{getProgramLevelLabel(item.enrollment.program_level)} - {getProgramStatusLabel(item.enrollment.status)}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <Info label="Proxima clase" value={nextClassLabel(item)} premium={premium} format={format} />
            <Info label="Horario" value={scheduleLabel(item)} premium={premium} format={format} />
            <Info label="Perro" value={item.enrollment.dog_name || item.profile?.dog_name || 'Sin registrar'} premium={premium} format={format} />
            <Info label="Asistencias" value={`${item.attendances.length} de ${item.program.required_attendances}`} premium={premium} format={format} />
          </View>

          <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Tarjeta de clase</Text>
            <InfoRow label="Inicio" value={dateLabel(item.enrollment.card_started_on || item.enrollment.started_at)} premium={premium} format={format} />
            <InfoRow label="Vigencia" value={dateLabel(item.enrollment.card_expires_on)} premium={premium} format={format} />
            <InfoRow label="Numero" value={item.enrollment.physical_card_number || 'Sin numero'} premium={premium} format={format} />
          </View>

          {item.enrollment.status === 'active' ? (
            <Pressable style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/attendance' as never)}>
              <MaterialIcons name="qr-code-scanner" size={20} color={format.primaryButtonText} />
              <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Registrar asistencia</Text>
            </Pressable>
          ) : null}

          <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Asistencias recientes</Text>
                <Text style={[styles.muted, { color: format.muted }]}>{item.attendances.length} registradas</Text>
              </View>
              {item.attendances.length > 5 ? (
                <Pressable onPress={() => router.push(`/client/attendance-history?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}><Text style={[styles.link, { color: premium ? '#FFE8B5' : format.accentDark }]}>Ver todas</Text></Pressable>
              ) : null}
            </View>
            {recent.length === 0 ? <Text style={[styles.muted, { color: format.muted }]}>Todavia no hay asistencias.</Text> : recent.map((attendance) => (
              <View key={attendance.id} style={[styles.attendanceRow, premium && styles.rowPremium]}>
                <MaterialIcons name="check-circle" size={19} color={premium ? '#FACC15' : ucapsaBrand.colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.attendanceDate, { color: format.cardText }]}>{dateLabel(attendance.attendance_date)}</Text>
                  <Text style={[styles.muted, { color: format.muted }]}>{attendance.source === 'qr_client' ? 'Registrada con QR' : 'Registro UCAPSA'}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Info({ label, value, premium, format }: { label: string; value: string; premium: boolean; format: ReturnType<typeof resolveUcapsaFormat> }) {
  return <View style={[styles.infoBox, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}><Text style={[styles.infoLabel, { color: format.muted }]}>{label}</Text><Text style={[styles.infoValue, { color: format.cardText }]}>{value}</Text>{premium ? null : null}</View>;
}

function InfoRow({ label, value, premium, format }: { label: string; value: string; premium: boolean; format: ReturnType<typeof resolveUcapsaFormat> }) {
  return <View style={[styles.infoRow, premium && styles.rowPremium]}><Text style={[styles.infoLabel, { color: format.muted }]}>{label}</Text><Text style={[styles.infoRowValue, { color: format.cardText }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: '#270711' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 20 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorBox: { gap: 5, borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 16 },
  errorBoxPremium: { borderColor: 'rgba(250,204,21,0.35)', backgroundColor: '#38111B' },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 17, fontWeight: '900' },
  errorTitlePremium: { color: '#FFE8B5' },
  empty: { gap: 6, paddingVertical: 24 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroPremium: { borderRadius: 22, borderWidth: 1, borderColor: 'rgba(250,204,21,0.35)', backgroundColor: '#6D0817', padding: 14 },
  heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  infoBox: { width: '48%', minHeight: 82, gap: 5, borderRadius: 18, borderWidth: 1, padding: 13 },
  infoLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  infoValue: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  card: { gap: 10, borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 10 },
  rowPremium: { borderTopColor: 'rgba(250,204,21,0.16)' },
  infoRowValue: { flex: 1, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, paddingVertical: 13, marginBottom: 14 },
  primaryButtonText: { fontSize: 14, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  link: { fontSize: 13, fontWeight: '900' },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F4E5E8', paddingTop: 10 },
  attendanceDate: { fontSize: 14, fontWeight: '900' },
});
