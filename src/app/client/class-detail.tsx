import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getMyProgramEnrollments,
  getProgramCodeLabel,
  getProgramEnrollmentDogName,
  getProgramLevelDisplayLabel,
  getProgramStatusLabel,
} from '../../services/programs.service';
import {
  getCanonicalNextProgramSessions,
  type ProgramNextSession,
} from '../../services/program-next-session.service';
import { clientReadKeys, readClientResource, sanitizeProgramRowsForCache, writeClientResource } from '../../services/client-read-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function nextClassLabel(session: ProgramNextSession | null, unavailable: boolean) {
  if (unavailable) return 'Sin verificar';
  if (!session) return 'Por confirmar';
  const [year, month, day] = session.dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return session.dateKey;
  return `${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]}${session.startTime ? `, ${session.startTime}` : ''}`;
}

function scheduleLabel(item: ProgramEnrollmentWithDetails) {
  const repeat = item.schedule.repeat_type === 'biweekly' ? 'Cada 2 semanas' : 'Cada semana';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[item.schedule.day_of_week] ?? 'Día'} ${time || '--:--'} · ${repeat}`;
}

export default function ClientClassDetailScreen() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId?: string }>();
  const { user, role, isAdmin } = useSession();
  const [item, setItem] = useState<ProgramEnrollmentWithDetails | null>(null);
  const [nextSession, setNextSession] = useState<ProgramNextSession | null>(null);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadRunRef = useRef(0);

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    if (!user || isAdmin || !enrollmentId) return;

    setError(null);
    setUsingSavedData(false);
    setNextSession(null);
    setSessionWarning(false);

    const cached = await readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs);
    if (!isCurrentRun()) return;
    const cachedItem = cached?.data.find((row) => row.enrollment.id === enrollmentId) ?? null;
    let resolvedItem = cachedItem;
    if (cachedItem) {
      setItem(cachedItem);
      setSavedAt(cached?.saved_at ?? null);
      setLoading(false);
    }

    try {
      const rows = await withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'class-detail');
      if (!isCurrentRun()) return;
      resolvedItem = rows.find((row) => row.enrollment.id === enrollmentId) ?? null;
      setItem(resolvedItem);
      const stored = await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(rows));
      if (!isCurrentRun()) return;
      setSavedAt(stored.saved_at);
    } catch {
      if (!isCurrentRun()) return;
      if (cachedItem) setUsingSavedData(true);
      else setError(friendlyReadError('No se pudo cargar la clase.'));
    }

    if (resolvedItem?.enrollment.status === 'active') {
      try {
        const sessions = await withOperationTimeout(
          getCanonicalNextProgramSessions([resolvedItem]),
          DEFAULT_READ_TIMEOUT_MS,
          'class-next-session',
        );
        if (!isCurrentRun()) return;
        setNextSession(sessions[resolvedItem.enrollment.id] ?? null);
        setSessionWarning(false);
      } catch {
        if (!isCurrentRun()) return;
        setNextSession(null);
        setSessionWarning(true);
      }
    }

    if (isCurrentRun()) setLoading(false);
  }, [enrollmentId, isAdmin, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => {
      loadRunRef.current += 1;
    };
  }, [load]));

  const recent = useMemo(() => [...(item?.attendances ?? [])].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)).slice(0, 5), [item]);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: Boolean(item?.enrollment.status === 'active') }), [isAdmin, item?.enrollment.status, role, user]);
  const premium = format.key === 'member';
  const levelLabel = item ? getProgramLevelDisplayLabel(item.program.code, item.enrollment.program_level) : null;
  const statusLabel = item ? getProgramStatusLabel(item.enrollment.status) : null;
  const unlimited = item?.enrollment.access_mode === 'membership';

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-classes" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} /> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando clase...</Text></View> : null}
      {error ? <View style={[styles.errorBox, premium && styles.errorBoxPremium]}><Text style={[styles.errorTitle, premium && styles.errorTitlePremium]}>No se pudo cargar</Text><Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{error}</Text><Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => void refresh()}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Reintentar</Text></Pressable></View> : null}
      {!loading && !error && !item ? <View style={styles.empty}><Text style={[styles.title, { color: format.text }]}>Clase no encontrada</Text><Text style={[styles.muted, { color: format.muted }]}>La inscripción ya no está disponible.</Text></View> : null}

      {item ? (
        <>
          <View style={[styles.classHeader, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <View style={[styles.heroIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="school" size={26} color={format.pillText} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}{levelLabel ? ` ${levelLabel}` : ''}</Text>
              <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{getProgramEnrollmentDogName(item)} · {statusLabel}</Text>
            </View>
          </View>

          <View style={[styles.primarySummary, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <View style={styles.summaryLine}>
              <View style={[styles.summaryIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="event" size={20} color={format.pillText} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.infoLabel, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>PRÓXIMA SESIÓN</Text>
                <Text style={[styles.nextSessionValue, { color: format.cardText }]}>{nextClassLabel(nextSession, sessionWarning)}</Text>
                <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{scheduleLabel(item)}</Text>
              </View>
            </View>

            <View style={[styles.progressRow, { borderTopColor: premium ? withAlpha(ucapsaBrand.colors.gold, 0.18) : format.cardBorder }]}>
              <View>
                <Text style={[styles.infoLabel, { color: format.muted }]}>ASISTENCIAS</Text>
                <Text style={[styles.progressValue, { color: format.cardText }]}>
                  {unlimited ? item.attendances.length : `${item.attendances.length} de ${item.program.required_attendances}`}
                </Text>
              </View>
              <Text style={[styles.progressMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
                {unlimited ? 'Acceso ilimitado por membresía' : 'Tu progreso de esta tarjeta'}
              </Text>
            </View>
          </View>

          {item.enrollment.status === 'active' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Registrar asistencia de ${getProgramEnrollmentDogName(item)}`} style={[styles.primaryButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/attendance' as never)}>
              <MaterialIcons name="qr-code-scanner" size={20} color={format.primaryButtonText} />
              <Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>Registrar asistencia</Text>
            </Pressable>
          ) : null}

          <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <Text style={[styles.sectionTitle, { color: format.cardText }]}>Datos de la inscripción</Text>
            <InfoRow label="Inicio" value={dateLabel(unlimited ? item.enrollment.started_at : item.enrollment.card_started_on || item.enrollment.started_at)} premium={premium} format={format} />
            <InfoRow label="Vigencia" value={unlimited ? 'Membresía activa · sin límite de clases' : dateLabel(item.enrollment.card_expires_on)} premium={premium} format={format} />
            <InfoRow label="Tarjeta" value={unlimited ? 'No aplica' : item.enrollment.physical_card_number || 'Sin número'} premium={premium} format={format} />
          </View>

          <View style={[styles.card, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: format.cardText }]}>Asistencias recientes</Text>
                <Text style={[styles.muted, { color: format.muted }]}>{item.attendances.length} registradas</Text>
              </View>
              {item.attendances.length > 5 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Ver todas las asistencias" onPress={() => router.push(`/client/attendance-history?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}><Text style={[styles.link, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Ver todas</Text></Pressable>
              ) : null}
            </View>
            {recent.length === 0 ? <Text style={[styles.muted, { color: format.muted }]}>Todavía no hay asistencias.</Text> : recent.map((attendance) => (
              <View key={attendance.id} style={[styles.attendanceRow, premium && styles.rowPremium]}>
                <MaterialIcons name="check-circle" size={19} color={premium ? ucapsaBrand.colors.gold : ucapsaBrand.colors.success} />
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

function InfoRow({ label, value, premium, format }: { label: string; value: string; premium: boolean; format: ReturnType<typeof resolveUcapsaFormat> }) {
  return <View style={[styles.infoRow, premium && styles.rowPremium]}><Text style={[styles.infoLabel, { color: format.muted }]}>{label}</Text><Text style={[styles.infoRowValue, { color: format.cardText }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 20 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorBox: { gap: 5, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 16 },
  errorBoxPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.35), backgroundColor: ucapsaBrand.colors.premiumSurface },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 17, fontWeight: '900' },
  errorTitlePremium: { color: ucapsaBrand.colors.premiumAction },
  empty: { gap: 6, paddingVertical: 24 },
  classHeader: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 21, borderWidth: 1, padding: 14, marginBottom: 12 },
  heroIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 2 },
  primarySummary: { gap: 13, borderRadius: 21, borderWidth: 1, padding: 15, marginBottom: 12 },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  summaryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.55 },
  nextSessionValue: { marginTop: 1, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  progressRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, paddingTop: 12 },
  progressValue: { marginTop: 2, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  progressMeta: { flex: 1, maxWidth: 180, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'right' },
  card: { gap: 10, borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.premiumMuted, paddingTop: 10 },
  rowPremium: { borderTopColor: withAlpha(ucapsaBrand.colors.gold, 0.16) },
  infoRowValue: { flex: 1, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, paddingVertical: 14, marginBottom: 14 },
  primaryButtonText: { fontSize: 14, fontWeight: '900' },
  secondaryButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, marginTop: 6 },
  secondaryButtonText: { fontSize: 13, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  link: { fontSize: 13, fontWeight: '900' },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.premiumMuted, paddingTop: 10 },
  attendanceDate: { fontSize: 14, fontWeight: '900' },
});