import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getMyProgramEnrollments,
  getNextProgramScheduleDate,
  getProgramCodeLabel,
  getProgramEnrollmentDogName,
  getProgramLevelDisplayLabel,
  getProgramStatusLabel,
} from '../../services/programs.service';
import { clientReadKeys, readClientResource, sanitizeProgramRowsForCache, writeClientResource } from '../../services/client-read-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';
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
  const { user, role, isAdmin } = useSession();
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    setUsingSavedData(false);

    const cached = await readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs);
    if (cached) {
      setRows(cached.data);
      setSavedAt(cached.saved_at);
      setLoading(false);
    }

    try {
      const fresh = await withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'programs');
      setRows(fresh);
      const stored = await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(fresh));
      setSavedAt(stored.saved_at);
      setUsingSavedData(false);
    } catch {
      if (cached) setUsingSavedData(true);
      else setError(friendlyReadError('No se pudieron cargar tus clases.'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const active = useMemo(() => rows.filter((item) => item.enrollment.status === 'active'), [rows]);
  const previous = useMemo(() => rows.filter((item) => item.enrollment.status !== 'active'), [rows]);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: active.length > 0 }), [active.length, isAdmin, role, user]);
  const premium = format.key === 'member';

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
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="classes" />
      <ClientPageHeader
        format={format}
        eyebrow="Tu entrenamiento"
        title="Clases"
        subtitle="Próximas sesiones, asistencias y programas anteriores."
        icon="school"
      />


      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} /> : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando clases...</Text></View> : null}
      {error ? <View style={[styles.errorBox, premium && styles.errorBoxPremium]}><Text style={[styles.errorTitle, premium && styles.errorTitlePremium]}>No se pudieron cargar</Text><Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{error}</Text><Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => void refresh()}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Reintentar</Text></Pressable></View> : null}

      {!loading && !error && active.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="school" size={32} color={format.accent} />
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>Sin clases activas</Text>
          <Text style={[styles.muted, { color: format.muted }]}>Cuando tengas una inscripcion activa de Puppy o Comandos aparecera aqui.</Text>
          <Pressable style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => router.push('/services' as never)}><Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>Ver servicios</Text></Pressable>
        </View>
      ) : null}

      {active.length > 0 ? (
        <>
          <View style={styles.currentHeader}>
            <View>
              <Text style={[styles.currentEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>TU PROGRAMA ACTUAL</Text>
              <Text style={[styles.sectionTitle, { color: format.text }]}>Lo que viene y lo que has usado</Text>
            </View>
          </View>
          <Pressable style={[styles.scanWideButton, { backgroundColor: format.primaryButton }]} onPress={() => router.push('/attendance' as never)}>
            <MaterialIcons name="qr-code-scanner" size={20} color={format.primaryButtonText} />
            <Text style={[styles.scanWideText, { color: format.primaryButtonText }]}>Registrar asistencia</Text>
          </Pressable>
        </>
      ) : null}
      {active.map((item) => <ClassCard key={item.enrollment.id} item={item} premium={premium} format={format} />)}

      {previous.length > 0 ? (
        <View style={styles.historySection}>
          <Text style={[styles.sectionTitle, { color: format.text }]}>Anteriores</Text>
          {previous.slice(0, 4).map((item) => <ClassCard key={item.enrollment.id} item={item} compact premium={premium} format={format} />)}
          {previous.length > 4 ? <Text style={[styles.muted, { color: format.muted }]}>Se muestran las 4 mas recientes.</Text> : null}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function ClassCard({ item, compact = false, premium, format }: { item: ProgramEnrollmentWithDetails; compact?: boolean; premium: boolean; format: ReturnType<typeof resolveUcapsaFormat> }) {
  const attendanceCount = item.attendances.length;
  const required = item.program.required_attendances;
  const remaining = required > 0 ? Math.max(0, required - attendanceCount) : null;
  const levelLabel = getProgramLevelDisplayLabel(item.program.code, item.enrollment.program_level);
  const statusLabel = getProgramStatusLabel(item.enrollment.status);
  const dogName = getProgramEnrollmentDogName(item);

  if (compact) {
    return (
      <Pressable style={[styles.historyCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}>
        <View style={[styles.historyIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="history" size={19} color={format.pillText} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.historyTitle, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}{levelLabel ? ` · ${levelLabel}` : ''}</Text>
          <Text style={[styles.cardMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{dogName} · {statusLabel} · {attendanceCount} asistencias</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
      </Pressable>
    );
  }

  return (
    <Pressable style={[styles.currentCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}>
      <View style={styles.currentCardTop}>
        <View style={[styles.programIconLarge, { backgroundColor: format.pillBackground }]}><MaterialIcons name="school" size={25} color={format.pillText} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.currentProgram, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}{levelLabel ? ` ${levelLabel}` : ''}</Text>
          <Text style={[styles.currentDog, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Con {dogName}</Text>
        </View>
        {!premium && remaining != null ? (
          <View style={[styles.remainingBox, { backgroundColor: format.accent }]}>
            <Text style={[styles.remainingNumber, { color: format.primaryButtonText }]}>{remaining}</Text>
            <Text style={[styles.remainingText, { color: format.primaryButtonText }]}>clases restantes</Text>
          </View>
        ) : premium ? <View style={[styles.memberMark, { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderColor: ucapsaBrand.colors.premiumBorder }]}><MaterialIcons name="workspace-premium" size={19} color={ucapsaBrand.colors.premiumAction} /></View> : null}
      </View>

      <View style={[styles.nextSession, { borderColor: format.border, backgroundColor: format.surfaceAlt }]}>
        <View style={[styles.nextSessionIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="event" size={19} color={format.pillText} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.nextSessionLabel, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>PRÓXIMA SESIÓN</Text>
          <Text style={[styles.nextClass, { color: format.cardText }]}>{nextClassLabel(item)}</Text>
          <Text style={[styles.scheduleText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{scheduleLabel(item)}</Text>
        </View>
      </View>

      <View style={styles.usageRow}>
        <View>
          <Text style={[styles.usageValue, { color: format.cardText }]}>{attendanceCount}</Text>
          <Text style={[styles.usageLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>asistencias registradas</Text>
        </View>
        <View style={[styles.detailButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
          <Text style={[styles.detailButtonText, { color: format.secondaryButtonText }]}>Ver programa</Text>
          <MaterialIcons name="arrow-forward" size={18} color={format.secondaryButtonText} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  header: { gap: 4, marginBottom: 14 },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { fontSize: 30, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  scanButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, paddingVertical: 13, marginBottom: 16 },
  scanButtonText: { fontSize: 14, fontWeight: '900' },
  currentHeader: { marginBottom: 8 },
  currentEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1.0, marginBottom: 2 },
  scanWideButton: { width: '100%', minHeight: 48, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  scanWideText: { fontSize: 13, fontWeight: '900' },
  currentCard: { gap: 13, borderRadius: 28, borderWidth: 1, padding: 16, marginBottom: 14 },
  currentCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  programIconLarge: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  currentProgram: { fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.25 },
  currentDog: { fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 2 },
  remainingBox: { width: 82, minHeight: 72, borderRadius: 20, padding: 8, alignItems: 'center', justifyContent: 'center' },
  remainingNumber: { fontSize: 27, lineHeight: 30, fontWeight: '900' },
  remainingText: { textAlign: 'center', fontSize: 9, lineHeight: 11, fontWeight: '900' },
  memberMark: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nextSession: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 20, borderWidth: 1, padding: 13 },
  nextSessionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nextSessionLabel: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  scheduleText: { fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 2 },
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  usageValue: { fontSize: 22, lineHeight: 25, fontWeight: '900' },
  usageLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  detailButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  detailButtonText: { fontSize: 11, fontWeight: '900' },
  historyCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, padding: 13, marginBottom: 9 },
  historyIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorBox: { gap: 4, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 16 },
  errorBoxPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.35), backgroundColor: ucapsaBrand.colors.premiumSurface },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 16, fontWeight: '900' },
  errorTitlePremium: { color: ucapsaBrand.colors.premiumAction },
  emptyCard: { gap: 9, alignItems: 'flex-start', borderRadius: 20, borderWidth: 1, padding: 18 },
  sectionTitle: { fontSize: 19, fontWeight: '900', marginBottom: 9 },
  secondaryButton: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 15, borderWidth: 1, paddingVertical: 11, marginTop: 3 },
  secondaryButtonText: { fontSize: 13, fontWeight: '900' },
  card: { gap: 10, borderRadius: 22, borderWidth: 1, padding: 15, marginBottom: 11 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  programIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  cardMeta: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  nextClass: { fontSize: 14, fontWeight: '900' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 8, overflow: 'hidden', borderRadius: 999, backgroundColor: ucapsaBrand.colors.premiumMuted },
  progressTrackPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.14) },
  progressFill: { height: '100%' },
  progressText: { fontSize: 12, fontWeight: '900' },
  historySection: { marginTop: 10 },
});
