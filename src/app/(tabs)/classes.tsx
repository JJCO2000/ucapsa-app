import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
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

function nextClassLabel(item: ProgramEnrollmentWithDetails) {
  const date = getNextProgramScheduleDate(item.schedule);
  if (!date) return 'Proxima clase por confirmar';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]}${time ? `, ${time}` : ''}`;
}

function scheduleLabel(item: ProgramEnrollmentWithDetails) {
  const repeat = item.schedule.repeat_type === 'biweekly' ? 'Cada 2 semanas' : 'Cada semana';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[item.schedule.day_of_week] ?? 'Dia'} ${time || '--:--'} - ${repeat}`;
}

export default function ClassesTab() {
  const { user, isAdmin } = useSession();
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    try { setRows(await getMyProgramEnrollments()); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron cargar tus clases.'); }
    finally { setLoading(false); }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const active = useMemo(() => rows.filter((item) => item.enrollment.status === 'active'), [rows]);
  const previous = useMemo(() => rows.filter((item) => item.enrollment.status !== 'active'), [rows]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-classes" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Mi UCAPSA</Text>
        <Text style={styles.title}>Clases</Text>
        <Text style={styles.subtitle}>Tus programas, horario, progreso y asistencias en un solo lugar.</Text>
      </View>

      {active.length > 0 ? (
        <Pressable style={styles.scanButton} onPress={() => router.push('/attendance' as never)}>
          <MaterialIcons name="qr-code-scanner" size={22} color="#fff" />
          <Text style={styles.scanButtonText}>Registrar asistencia</Text>
        </Pressable>
      ) : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando clases...</Text></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>No se pudieron cargar</Text><Text style={styles.muted}>{error}</Text></View> : null}

      {!loading && !error && active.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="school" size={32} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.sectionTitle}>Sin clases activas</Text>
          <Text style={styles.muted}>Cuando tengas una inscripcion activa de Puppy o Comandos aparecera aqui.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.push('/services' as never)}><Text style={styles.secondaryButtonText}>Ver servicios</Text></Pressable>
        </View>
      ) : null}

      {active.length > 0 ? <Text style={styles.sectionTitle}>Activas</Text> : null}
      {active.map((item) => <ClassCard key={item.enrollment.id} item={item} />)}

      {previous.length > 0 ? (
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Anteriores</Text>
          {previous.slice(0, 4).map((item) => <ClassCard key={item.enrollment.id} item={item} compact />)}
          {previous.length > 4 ? <Text style={styles.muted}>Se muestran las 4 mas recientes.</Text> : null}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function ClassCard({ item, compact = false }: { item: ProgramEnrollmentWithDetails; compact?: boolean }) {
  const progress = item.program.required_attendances > 0
    ? Math.min(100, Math.round((item.attendances.length / item.program.required_attendances) * 100))
    : 0;
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}>
      <View style={styles.cardTop}>
        <View style={styles.programIcon}><MaterialIcons name="school" size={22} color={ucapsaBrand.colors.redDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{getProgramCodeLabel(item.program.code)}</Text>
          <Text style={styles.cardMeta}>{getProgramLevelLabel(item.enrollment.program_level)} - {getProgramStatusLabel(item.enrollment.status)}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
      </View>
      {!compact ? (
        <>
          <Text style={styles.nextClass}>{nextClassLabel(item)}</Text>
          <Text style={styles.muted}>{scheduleLabel(item)}</Text>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
            <Text style={styles.progressText}>{item.attendances.length}/{item.program.required_attendances}</Text>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  scanButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13, marginBottom: 16 },
  scanButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorBox: { gap: 4, borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 16 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 16, fontWeight: '900' },
  emptyCard: { gap: 9, alignItems: 'flex-start', borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 18 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900', marginBottom: 9 },
  secondaryButton: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, paddingVertical: 11, marginTop: 3 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  card: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 15, marginBottom: 11 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  programIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  cardMeta: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  nextClass: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 8, overflow: 'hidden', borderRadius: 999, backgroundColor: '#F3E2E5' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: ucapsaBrand.colors.red },
  progressText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  historySection: { marginTop: 8 },
});
