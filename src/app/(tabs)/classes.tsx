import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand } from '../../constants/brand';
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
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

const dayNamesLong = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function nextClassLabel(session: ProgramNextSession | null, unavailable: boolean) {
  if (unavailable) return 'Próxima sesión sin verificar';
  if (!session) return 'Próxima clase por confirmar';
  const [year, month, day] = session.dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return session.dateKey;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]}${session.startTime ? `, ${session.startTime}` : ''}`;
}

function scheduleLabel(item: ProgramEnrollmentWithDetails) {
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  const day = dayNamesLong[item.schedule.day_of_week] ?? 'día por confirmar';
  if (item.schedule.repeat_type === 'biweekly') {
    return `Horario habitual: ${day} ${time || '--:--'} · Cada 2 semanas`;
  }
  return `Horario habitual: ${day} ${time || '--:--'}`;
}

function visibleLevelLabel(item: ProgramEnrollmentWithDetails) {
  return getProgramLevelDisplayLabel(item.program.code, item.enrollment.program_level);
}

export default function ClassesTab() {
  const { user, role, isAdmin } = useSession();
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [nextSessions, setNextSessions] = useState<Record<string, ProgramNextSession>>({});
  const [sessionWarning, setSessionWarning] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [offlineEmpty, setOfflineEmpty] = useState(false);
  const cacheScopeRef = useRef<string | null>(null);
  const loadRunRef = useRef(0);

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    const scope = user?.id ?? (isAdmin ? 'admin' : 'public');

    if (cacheScopeRef.current !== scope) {
      cacheScopeRef.current = scope;
      setRows([]);
      setNextSessions({});
      setSessionWarning(false);
      setLocalReady(false);
      setUsingSavedData(false);
      setSavedAt(null);
      setOfflineEmpty(false);
    }

    if (!user || isAdmin) return;
    if (!isCurrentRun()) return;
    setUsingSavedData(false);
    setOfflineEmpty(false);
    setSessionWarning(false);

    const cached = await readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs);
    if (!isCurrentRun()) return;
    let nextRows = cached?.data ?? [];
    if (cached) {
      setRows(nextRows);
      setSavedAt(cached.saved_at);
    }
    setLocalReady(true);

    try {
      const fresh = await withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'programs');
      if (!isCurrentRun()) return;
      nextRows = fresh;
      setRows(fresh);
      const stored = await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(fresh));
      if (!isCurrentRun()) return;
      setSavedAt(stored.saved_at);
      setUsingSavedData(false);
      setOfflineEmpty(false);
    } catch {
      if (!isCurrentRun()) return;
      if (cached) setUsingSavedData(true);
      else setOfflineEmpty(true);
    }

    try {
      const sessions = await withOperationTimeout(
        getCanonicalNextProgramSessions(nextRows),
        DEFAULT_READ_TIMEOUT_MS,
        'program-next-sessions',
      );
      if (!isCurrentRun()) return;
      setNextSessions(sessions);
      setSessionWarning(false);
    } catch {
      if (!isCurrentRun()) return;
      setNextSessions({});
      setSessionWarning(nextRows.some((item) => item.enrollment.status === 'active'));
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => {
      loadRunRef.current += 1;
    };
  }, [load]));

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
      <CompactClassesHeader premium={premium} format={format} />

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando clases guardadas" /> : null}

      {localReady && rows.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name={offlineEmpty ? 'cloud-off' : 'school'} size={30} color={offlineEmpty ? format.accentDark : format.accent} />
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>{offlineEmpty ? 'Clases aún no guardadas' : 'Sin clases activas'}</Text>
          <Text style={[styles.muted, { color: format.muted }]}>{offlineEmpty ? 'Conéctate una vez para guardar tus clases y asistencias en este dispositivo.' : 'Cuando tengas una inscripción activa de Puppy o Comandos aparecerá aquí.'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={offlineEmpty ? 'Reintentar sincronización de clases' : 'Ver servicios'} style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={offlineEmpty ? () => void refresh() : () => router.push('/services' as never)}>
            <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>{offlineEmpty ? 'Reintentar' : 'Ver servicios'}</Text>
          </Pressable>
        </View>
      ) : null}

      {active.map((item) => (
        <ClassCard
          key={item.enrollment.id}
          item={item}
          nextSession={nextSessions[item.enrollment.id] ?? null}
          sessionUnavailable={sessionWarning}
          premium={premium}
          format={format}
        />
      ))}

      {previous.length > 0 ? (
        <View style={styles.historySection}>
          <Text style={[styles.sectionTitle, { color: format.text }]}>Anteriores</Text>
          {previous.map((item) => <ClassCard key={item.enrollment.id} item={item} nextSession={null} sessionUnavailable={false} compact premium={premium} format={format} />)}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function CompactClassesHeader({ premium, format }: { premium: boolean; format: ReturnType<typeof resolveUcapsaFormat> }) {
  return (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft, borderColor: premium ? ucapsaBrand.colors.premiumBorder : format.border }]}>
        <MaterialIcons name="school" size={25} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
      </View>
      <View style={styles.headerCopy}>
        <Text style={[styles.headerTitle, { color: format.text }]}>Clases</Text>
        <Text style={[styles.headerSubtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Tu programa y próximas sesiones</Text>
      </View>
    </View>
  );
}

function ClassCard({
  item,
  nextSession,
  sessionUnavailable,
  compact = false,
  premium,
  format,
}: {
  item: ProgramEnrollmentWithDetails;
  nextSession: ProgramNextSession | null;
  sessionUnavailable: boolean;
  compact?: boolean;
  premium: boolean;
  format: ReturnType<typeof resolveUcapsaFormat>;
}) {
  const attendanceCount = item.attendances.length;
  const unlimited = item.enrollment.access_mode === 'membership';
  const required = item.program.required_attendances;
  const remaining = !unlimited && required > 0 ? Math.max(0, required - attendanceCount) : null;
  const levelLabel = visibleLevelLabel(item);
  const statusLabel = getProgramStatusLabel(item.enrollment.status);
  const dogName = getProgramEnrollmentDogName(item);
  const classLabel = `${getProgramCodeLabel(item.program.code)}${levelLabel ? ` ${levelLabel}` : ''} con ${dogName}`;
  const detailRoute = `/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never;

  if (compact) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${classLabel}`} style={[styles.historyCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={() => router.push(detailRoute)}>
        <View style={[styles.historyIcon, { backgroundColor: format.pillBackground }]}>
          <MaterialIcons name={item.enrollment.status === 'completed' ? 'check-circle' : 'history'} size={19} color={format.pillText} />
        </View>
        <View style={styles.historyCopy}>
          <Text style={[styles.historyTitle, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}{levelLabel ? ` · ${levelLabel}` : ''}</Text>
          <Text style={[styles.cardMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{dogName} · {statusLabel} · {attendanceCount} asistencias</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.currentCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
      <View style={styles.currentCardTop}>
        <View style={[styles.programIconLarge, { backgroundColor: format.pillBackground }]}>
          <MaterialIcons name="school" size={24} color={format.pillText} />
        </View>
        <View style={styles.programCopy}>
          <Text style={[styles.currentProgram, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}{levelLabel ? ` ${levelLabel}` : ''}</Text>
          <Text style={[styles.currentDog, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Con {dogName}</Text>
        </View>
        {!unlimited && remaining != null ? (
          <View style={[styles.remainingBadge, { backgroundColor: format.accentSoft, borderColor: format.border }]}>
            <Text style={[styles.remainingNumber, { color: format.accentDark }]}>{remaining}</Text>
            <Text style={[styles.remainingText, { color: format.muted }]}>restantes</Text>
          </View>
        ) : unlimited ? (
          <View style={[styles.memberMark, { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderColor: ucapsaBrand.colors.premiumBorder }]}>
            <MaterialIcons name="workspace-premium" size={19} color={ucapsaBrand.colors.premiumAction} />
          </View>
        ) : null}
      </View>

      <View style={[styles.nextSession, { borderColor: format.border, backgroundColor: format.surfaceAlt }]}>
        <View style={[styles.nextSessionIcon, { backgroundColor: format.pillBackground }]}>
          <MaterialIcons name="event" size={19} color={format.pillText} />
        </View>
        <View style={styles.sessionCopy}>
          <Text style={[styles.nextSessionLabel, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>PRÓXIMA SESIÓN</Text>
          <Text style={[styles.nextClass, { color: format.cardText }]}>{nextClassLabel(nextSession, sessionUnavailable)}</Text>
          <Text style={[styles.scheduleText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{scheduleLabel(item)}</Text>
        </View>
      </View>

      <View style={styles.usageRow}>
        <Text style={[styles.usageValue, { color: format.cardText }]}>{attendanceCount}</Text>
        <Text style={[styles.usageLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
          {unlimited ? 'asistencias · acceso ilimitado' : 'asistencias registradas'}
        </Text>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={`Ver detalle de ${classLabel}`} style={[styles.detailButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]} onPress={() => router.push(detailRoute)}>
        <Text style={[styles.detailButtonText, { color: format.secondaryButtonText }]}>Ver detalle</Text>
        <MaterialIcons name="arrow-forward" size={18} color={format.secondaryButtonText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, paddingHorizontal: 2 },
  headerIcon: { width: 48, height: 48, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.45 },
  headerSubtitle: { marginTop: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  currentCard: { gap: 12, borderRadius: 24, borderWidth: 1, padding: 14, marginBottom: 14 },
  currentCardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  programIconLarge: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  programCopy: { flex: 1, minWidth: 0 },
  currentProgram: { fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.22 },
  currentDog: { fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 1 },
  remainingBadge: { minWidth: 58, borderRadius: 15, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  remainingNumber: { fontSize: 17, lineHeight: 20, fontWeight: '900' },
  remainingText: { fontSize: 9, lineHeight: 12, fontWeight: '800' },
  memberMark: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nextSession: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 12 },
  nextSessionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sessionCopy: { flex: 1, minWidth: 0 },
  nextSessionLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8 },
  nextClass: { marginTop: 1, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  scheduleText: { fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  usageRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  usageValue: { fontSize: 26, lineHeight: 29, fontWeight: '900' },
  usageLabel: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  detailButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 15, borderWidth: 1, paddingHorizontal: 11 },
  detailButtonText: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
  historySection: { marginTop: 3 },
  sectionTitle: { fontSize: 22, lineHeight: 27, fontWeight: '900', marginBottom: 10 },
  historyCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 8 },
  historyIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  historyCopy: { flex: 1, minWidth: 0 },
  historyTitle: { fontSize: 15, lineHeight: 19, fontWeight: '900' },
  cardMeta: { fontSize: 11, lineHeight: 16, fontWeight: '800', marginTop: 1 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  emptyCard: { gap: 9, alignItems: 'flex-start', borderRadius: 20, borderWidth: 1, padding: 16 },
  secondaryButton: { minHeight: 46, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, paddingVertical: 10, marginTop: 2 },
  secondaryButtonText: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
});